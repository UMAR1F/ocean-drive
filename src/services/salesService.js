// src/services/salesService.js
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  orderBy, 
  runTransaction,
  serverTimestamp 
} from 'firebase/firestore';
import { offlineDb } from './offlineDb';
import { syncService } from './syncService';
import { productService } from './productService';
import { auditService } from './auditService';
import { getOfflineAllocationId, offlineStockService } from './offlineStockService';

const COLLECTION_NAME = 'sales';

const logSaleAudit = async (actionType, saleId, saleData, cashierUser, mode) => {
  try {
    await auditService.logAction({
      actionType,
      entityId: saleId,
      entityName: `Order #${String(saleId).slice(-6)}`,
      details: `Completed ${mode} sale. Items: ${saleData.items.length}, Total: ₦${saleData.total.toFixed(2)}, Payment: ${saleData.paymentMethod}`,
      user: cashierUser
    });
  } catch (error) {
    console.warn('Sale completed, but its audit log could not be saved:', error);
  }
};

export const salesService = {
  async getPOSProducts() {
    if (navigator.onLine) {
      const cachedDevice = await offlineStockService.getCurrentDevice();
      if (cachedDevice) {
        try {
          await offlineStockService.refreshCurrentDevice();
        } catch (error) {
          console.warn('Could not refresh this terminal’s offline allocation:', error);
        }
      }
    }

    const [products, device, allocations] = await Promise.all([
      productService.getAllProducts(),
      offlineStockService.getCurrentDevice(),
      offlineStockService.getCurrentAllocations()
    ]);
    const allocationByProduct = new Map(allocations.map((allocation) => [
      String(allocation.productId),
      Number(allocation.remainingUnits || 0)
    ]));
    const isRegistered = device?.active !== false && Boolean(device);

    return products.map((product) => {
      const stock = Number(product.stock || 0);
      const reserved = Number(product.offlineReservedUnits || 0);
      const ownAllocation = isRegistered ? (allocationByProduct.get(String(product.id)) || 0) : 0;
      const sellableStock = navigator.onLine
        ? Math.max(0, stock - reserved + ownAllocation)
        : (isRegistered ? Math.max(0, Math.min(stock, ownAllocation)) : 0);
      return { ...product, stock: sellableStock, physicalStock: stock };
    });
  },

  async completeSale(cartItems, paymentDetails, cashierUser) {
    const timestamp = new Date().toISOString();

    const saleData = {
      items: cartItems.map(item => {
        const itemPrice = item.selectedPrice !== undefined ? item.selectedPrice : (item.price || item.sellingPrice || 0);
        const unitsPerItem = item.piecesPerUnit || (item.selectedUnitType === 'carton'
          ? item.piecesPerCarton || 1
          : item.selectedUnitType === 'crate'
          ? item.piecesPerCrate || 1
          : 1);
        const unitsToDeduct = item.quantity * unitsPerItem;
        const rawUnitCost = Number(item.costPrice);
        const unitCostAtSale = Number.isFinite(rawUnitCost) && rawUnitCost > 0 ? rawUnitCost : null;
        const lineTotal = itemPrice * item.quantity;

        return {
          productId: item.id,
          name: item.name,
          barcode: item.barcode || '',
          unitType: item.selectedUnitType || 'piece',
          price: itemPrice,
          quantity: item.quantity,
          unitsDeducted: unitsToDeduct,
          total: lineTotal,
          unitCostAtSale,
          costTotal: unitCostAtSale === null ? null : unitCostAtSale * unitsToDeduct
        };
      }),
      subtotal: cartItems.reduce((sum, item) => {
        const itemPrice = item.selectedPrice !== undefined ? item.selectedPrice : (item.price || item.sellingPrice || 0);
        return sum + (itemPrice * item.quantity);
      }, 0),
      discount: paymentDetails.discount || 0,
      total: Math.max(0, cartItems.reduce((sum, item) => {
        const itemPrice = item.selectedPrice !== undefined ? item.selectedPrice : (item.price || item.sellingPrice || 0);
        return sum + (itemPrice * item.quantity);
      }, 0) - (paymentDetails.discount || 0)),
      paymentMethod: paymentDetails.method || 'cash',
      cashReceived: paymentDetails.cashReceived || 0,
      change: paymentDetails.change || 0,
      cashierId: cashierUser?.uid || cashierUser?.id || 'unknown',
      cashierEmail: cashierUser?.email || 'staff@skylightethic.com',
      cashierName: cashierUser?.fullName || cashierUser?.displayName || cashierUser?.name || cashierUser?.email?.split('@')[0] || 'Staff',
      deviceId: offlineStockService.getCurrentDeviceId(),
      status: 'completed',
      createdAt: timestamp
    };

    if (saleData.items.length === 0) {
      throw new Error('Add at least one product before completing the sale.');
    }
    if (saleData.paymentMethod === 'cash' && saleData.cashReceived < saleData.total) {
      throw new Error('Cash received must cover the total amount due.');
    }

    try {
      if (!navigator.onLine) {
        console.log("Offline: Saving sale locally and queuing for sync");

        const unitsByProduct = new Map();
        for (const item of saleData.items) {
          const requirement = unitsByProduct.get(item.productId) || { name: item.name, units: 0 };
          requirement.units += item.unitsDeducted;
          unitsByProduct.set(item.productId, requirement);
        }
        await offlineDb.consumeOfflineAllocation(
          saleData.deviceId,
          [...unitsByProduct].map(([productId, requirement]) => ({
            productId,
            name: requirement.name,
            units: requirement.units
          }))
        );

        const localId = await offlineDb.add(COLLECTION_NAME, saleData);
        const savedOfflineSale = { id: localId, ...saleData };
        await offlineDb.put(COLLECTION_NAME, savedOfflineSale);

        const remoteId = doc(collection(db, COLLECTION_NAME)).id;
        await syncService.addToQueue({ 
          type: 'COMPLETE_SALE', 
          collection: COLLECTION_NAME, 
          data: saleData, 
          localId,
          remoteId,
          deviceId: saleData.deviceId,
          atomicStock: true
        });

        await logSaleAudit('SALE_COMPLETED_OFFLINE', localId, saleData, cashierUser, 'offline');

        return { success: true, total: saleData.total, offline: true, saleData: savedOfflineSale };
      }

      console.log("Online: Processing sale transaction in Firestore...");
      
      const unitsByProduct = new Map();
      for (const item of saleData.items) {
        const requirement = unitsByProduct.get(item.productId) || { name: item.name, units: 0 };
        requirement.units += item.unitsDeducted;
        unitsByProduct.set(item.productId, requirement);
      }

      let createdDocId = null;
      let committedSaleData = saleData;
      const updatedProducts = [];
      await runTransaction(db, async (transaction) => {
        updatedProducts.length = 0;
        const productDocs = [];
        for (const [productId, requirement] of unitsByProduct) {
          const productRef = doc(db, 'products', productId);
          const productDoc = await transaction.get(productRef);
          
          if (!productDoc.exists()) {
            throw new Error(`Product ${requirement.name} no longer exists.`);
          }

          const productData = productDoc.data();
          if (productData.isActive === false) {
            throw new Error(`Product ${requirement.name} is no longer available.`);
          }
          const currentStock = Number(productData.stock || 0);
          const reservedUnits = Number(productData.offlineReservedUnits || 0);
          const allocationRef = doc(db, 'offlineStockAllocations', getOfflineAllocationId(saleData.deviceId, productId));
          const allocationDoc = await transaction.get(allocationRef);
          const ownAllocation = allocationDoc.exists() ? Number(allocationDoc.data().remainingUnits || 0) : 0;
          const allocatedUnits = Math.min(ownAllocation, requirement.units);
          const unreservedUnitsNeeded = requirement.units - allocatedUnits;
          const unreservedUnitsAvailable = Math.max(0, currentStock - reservedUnits);
          if (unreservedUnitsAvailable < unreservedUnitsNeeded) {
            throw new Error(`Insufficient available stock for ${requirement.name}. Required units: ${requirement.units}, Available: ${unreservedUnitsAvailable + allocatedUnits}`);
          }

          productDocs.push({
            productRef,
            allocationRef,
            productData,
            currentStock,
            reservedUnits,
            ownAllocation,
            allocatedUnits,
            unitsDeducted: requirement.units
          });
        }

        const costByProduct = new Map(productDocs.map((product) => [
          String(product.productRef.id),
          Number(product.productData.costPrice)
        ]));
        committedSaleData = {
          ...saleData,
          items: saleData.items.map((item) => {
            const unitCost = costByProduct.get(String(item.productId));
            const knownUnitCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null;
            return {
              ...item,
              unitCostAtSale: knownUnitCost,
              costTotal: knownUnitCost === null ? null : knownUnitCost * Number(item.unitsDeducted || 0)
            };
          })
        };

        for (const p of productDocs) {
          const nextStock = p.currentStock - p.unitsDeducted;
          const nextReservedUnits = Math.max(0, p.reservedUnits - p.allocatedUnits);
          transaction.update(p.productRef, {
            stock: nextStock,
            offlineReservedUnits: nextReservedUnits,
            updatedAt: serverTimestamp()
          });
          if (p.allocatedUnits > 0) {
            transaction.update(p.allocationRef, {
              remainingUnits: p.ownAllocation - p.allocatedUnits,
              updatedAt: serverTimestamp()
            });
          }
          updatedProducts.push({
            ...p.productData,
            id: p.productRef.id,
            stock: nextStock,
            offlineReservedUnits: nextReservedUnits
          });
        }

        const newSaleRef = doc(collection(db, COLLECTION_NAME));
        createdDocId = newSaleRef.id;
        transaction.set(newSaleRef, {
          ...committedSaleData,
          createdAt: serverTimestamp()
        });
      });

      const finalSavedSale = { id: createdDocId, ...committedSaleData };
      try {
        for (const product of updatedProducts) await offlineDb.put('products', product);
        const cachedAllocations = await offlineDb.getAll('offlineStockAllocations');
        for (const product of updatedProducts) {
          const allocation = cachedAllocations.find((entry) => (
            entry.deviceId === saleData.deviceId && String(entry.productId) === String(product.id)
          ));
          if (allocation) {
            await offlineDb.put('offlineStockAllocations', {
              ...allocation,
              remainingUnits: Math.max(0, Number(allocation.remainingUnits || 0) - Math.min(Number(allocation.remainingUnits || 0), unitsByProduct.get(String(product.id))?.units || 0))
            });
          }
        }
        await offlineDb.put(COLLECTION_NAME, finalSavedSale);
      } catch (cacheError) {
        console.warn('Sale completed, but the local sales cache could not be updated:', cacheError);
      }
      await logSaleAudit('SALE_COMPLETED', createdDocId, committedSaleData, cashierUser, 'online');

      return { success: true, total: committedSaleData.total, offline: false, saleData: finalSavedSale };
    } catch (error) {
      console.error('Sale transaction failed:', error);
      throw error;
    }
  },

  async getSalesHistory(currentUser) {
    const isAdmin = currentUser?.role === 'admin' || currentUser?.isAdmin || currentUser?.userRole === 'admin';
    const userId = currentUser?.uid || currentUser?.id;
    const userEmail = currentUser?.email;

    try {
      if (navigator.onLine) {
        try {
          console.log("Online: Syncing latest remote sales to local cache...");
          const salesRef = collection(db, COLLECTION_NAME);
          const q = query(salesRef, orderBy('createdAt', 'desc'));
          const snapshot = await getDocs(q);
          
          const remoteSales = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            if (data.createdAt && typeof data.createdAt.toDate === 'function') {
              data.createdAt = data.createdAt.toDate().toISOString();
            }
            if (data.returnedAt && typeof data.returnedAt.toDate === 'function') {
              data.returnedAt = data.returnedAt.toDate().toISOString();
            }
            return { id: docSnap.id, ...data };
          });

          for (const sale of remoteSales) {
            await offlineDb.put(COLLECTION_NAME, sale);
          }
        } catch (remoteErr) {
          console.warn("Network request aborted or failed, switching to local cache:", remoteErr.message);
        }
      }

      console.log("Serving sales history from unified local DB cache...");
      let salesData = [];
      try {
        salesData = await offlineDb.getAll(COLLECTION_NAME);
      } catch (dbErr) {
        console.warn("Local DB read warning:", dbErr);
      }

      if (!Array.isArray(salesData)) salesData = [];

      salesData.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
      });

      if (!isAdmin && (userId || userEmail)) {
        salesData = salesData.filter(s => s.cashierId === userId || s.cashierEmail === userEmail);
      }

      return salesData;
    } catch (error) {
      console.warn("Sales history fetch failed completely, utilizing fallback local recovery:", error);
      let localSales = [];
      try {
        localSales = await offlineDb.getAll(COLLECTION_NAME);
      } catch (e) {
        localSales = [];
      }
      
      let salesData = Array.isArray(localSales) ? localSales : [];
      salesData.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      
      return isAdmin ? salesData : salesData.filter(s => s.cashierId === userId || s.cashierEmail === userEmail);
    }
  },

  async returnSale(saleId, currentUser) {
    const isAdmin = currentUser?.role === 'admin' || currentUser?.isAdmin || currentUser?.userRole === 'admin';
    if (!isAdmin) {
      throw new Error("Unauthorized: Only administrators can process product returns.");
    }

    try {
      const isLocalId = String(saleId).startsWith('offline_');

      if (!navigator.onLine || isLocalId) {
        console.log("Processing return locally (offline mode or local offline ID)...");
        
        const localSales = await offlineDb.getAll(COLLECTION_NAME);
        const targetSale = localSales.find(s => s.id === saleId);

        if (!targetSale) {
          throw new Error("Sale record not found in local offline storage.");
        }
        if (targetSale.status === 'returned') {
          throw new Error("This transaction has already been marked as returned.");
        }

        targetSale.status = 'returned';
        targetSale.returnedAt = new Date().toISOString();
        targetSale.returnedBy = currentUser?.uid || currentUser?.id || 'admin';
        await offlineDb.put(COLLECTION_NAME, targetSale);

        for (const item of targetSale.items) {
          const unitsToRestock = item.unitsDeducted || item.quantity;
          await productService.adjustStock(item.productId, unitsToRestock, {
            preserveCost: true,
            queueSync: isLocalId,
            localOnly: isLocalId
          });
        }

        if (!isLocalId) {
          await syncService.addToQueue({ 
            type: 'RETURN_SALE', 
            collection: COLLECTION_NAME, 
            saleId, 
            cashierId: currentUser?.uid || currentUser?.id || 'admin' 
          });
        }

        await auditService.logAction({
          actionType: 'SALE_RETURNED',
          entityId: saleId,
          entityName: `Return / Refund for Sale #${String(saleId).slice(-6)}`,
          details: `Transaction marked as returned and inventory restocked (offline mode).`,
          user: currentUser
        });

        return { success: true, message: 'Return processed successfully and inventory restocked.', offline: true };
      }

      await runTransaction(db, async (transaction) => {
        const saleRef = doc(db, COLLECTION_NAME, saleId);
        const saleDoc = await transaction.get(saleRef);

        if (!saleDoc.exists()) {
          throw new Error("Sale record not found in Firestore.");
        }

        const saleData = saleDoc.data();
        if (saleData.status === 'returned') {
          throw new Error("This transaction has already been marked as returned.");
        }

        const restockOps = [];
        for (const item of saleData.items) {
          const productRef = doc(db, 'products', item.productId);
          const productDoc = await transaction.get(productRef);

          if (productDoc.exists()) {
            const currentStock = Number(productDoc.data().stock || 0);
            const unitsToRestock = item.unitsDeducted || item.quantity;
            restockOps.push({ productRef, newStock: currentStock + unitsToRestock });
          }
        }

        for (const op of restockOps) {
          transaction.update(op.productRef, {
            stock: op.newStock,
            updatedAt: serverTimestamp()
          });
        }

        transaction.update(saleRef, {
          status: 'returned',
          returnedAt: serverTimestamp(),
          returnedBy: currentUser?.uid || currentUser?.id || 'admin'
        });
      });

      const localSales = await offlineDb.getAll(COLLECTION_NAME);
      const targetSale = localSales.find(s => s.id === saleId);
      if (targetSale) {
        targetSale.status = 'returned';
        await offlineDb.put(COLLECTION_NAME, targetSale);
      }

      await auditService.logAction({
        actionType: 'SALE_RETURNED',
        entityId: saleId,
        entityName: `Return / Refund for Sale #${String(saleId).slice(-6)}`,
        details: `Transaction marked as returned and inventory restocked successfully.`,
        user: currentUser
      });

      return { success: true, message: 'Sale successfully returned and inventory restocked.' };
    } catch (error) {
      console.error("Return transaction failed:", error);
      throw error;
    }
  }
};