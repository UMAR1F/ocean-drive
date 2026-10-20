// Handles synchronization between IndexedDB offline cache and Firebase Firestore

import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getAllLocal, saveLocal, deleteLocal, openDB } from './offlineDb';
import { getOfflineAllocationId } from './offlineStockService';

const QUEUE_COLLECTION = 'offlineQueue';
let syncInProgress = false;

const persistProductIdMapping = async (queueItems, localId, remoteId) => {
  const database = await openDB();
  for (const queuedItem of queueItems) {
    let changed = false;
    const mappedItem = { ...queuedItem };
    if (['UPDATE_PRODUCT', 'ADJUST_STOCK', 'DELETE_PRODUCT'].includes(mappedItem.type) && String(mappedItem.id) === String(localId)) {
      mappedItem.id = remoteId;
      changed = true;
    }
    if (mappedItem.type === 'DECREMENT_STOCK' && String(mappedItem.productId) === String(localId)) {
      mappedItem.productId = remoteId;
      changed = true;
    }
    if (mappedItem.data && Array.isArray(mappedItem.data.items)) {
      const items = mappedItem.data.items.map((item) => {
        if (String(item.productId) !== String(localId)) return item;
        changed = true;
        return { ...item, productId: remoteId };
      });
      mappedItem.data = { ...mappedItem.data, items };
    }
    if (mappedItem.data && Array.isArray(mappedItem.data.orderItems)) {
      const orderItems = mappedItem.data.orderItems.map((item) => {
        if (String(item.productId) !== String(localId)) return item;
        changed = true;
        return { ...item, productId: remoteId };
      });
      mappedItem.data = { ...mappedItem.data, orderItems };
    }
    if (!changed || queuedItem.dbKey === undefined) continue;

    mappedItem.localId = queuedItem.dbKey;
    const transaction = database.transaction(QUEUE_COLLECTION, 'readwrite');
    transaction.objectStore(QUEUE_COLLECTION).put(mappedItem);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Could not update a pending sync item.'));
    });
    Object.assign(queuedItem, mappedItem);
  }
};

// Helper to strip undefined values which cause Firestore "invalid-argument" crashes
const cleanData = (data) => {
  if (!data || typeof data !== 'object') return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key, 
      value === undefined ? null : value
    ])
  );
};

export const syncService = {
  async addToQueue(mutation) {
    try {
      const queueItem = {
        ...mutation,
        data: cleanData(mutation.data),
        localTimestamp: Date.now()
      };
      await saveLocal(QUEUE_COLLECTION, queueItem);
      console.log("Mutation added to offline queue:", mutation.type);
    } catch (error) {
      console.error("Error adding to offline queue:", error);
    }
  },

  async syncProductsDown() {
    try {
      const querySnapshot = await getDocs(collection(db, 'products'));
      const products = [];
      querySnapshot.forEach((docSnap) => {
        const product = { id: docSnap.id, ...docSnap.data() };
        products.push(product);
        saveLocal('products', product);
      });
      return products;
    } catch (error) {
      console.warn("Offline or sync error, falling back to local cache:", error);
      return await getAllLocal('products');
    }
  },

  async syncPendingQueue() {
    if (!navigator.onLine || syncInProgress) return;
    syncInProgress = true;

    try {
      const dbInstance = await openDB();
      const queueItems = await new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(QUEUE_COLLECTION, 'readonly');
        const store = transaction.objectStore(QUEUE_COLLECTION);
        const request = store.openCursor();
        const results = [];

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            results.push({ dbKey: cursor.primaryKey, ...cursor.value });
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        request.onerror = () => reject(request.error);
      });

      if (!queueItems || queueItems.length === 0) return;

      console.log(`Syncing ${queueItems.length} pending offline mutations to Firestore...`);

      const legacySaleIds = new Set(queueItems
        .filter(item => item.type === 'COMPLETE_SALE' && !item.atomicStock)
        .map(item => item.localId)
        .filter(Boolean));
      const idMappings = {};

      for (const item of queueItems) {
        const dbKey = item.dbKey; 

        let targetId = item.id || item.localId;
        if (targetId && idMappings[targetId]) {
          targetId = idMappings[targetId];
        }

        try {
          const sanitizedData = cleanData(item.data);

          if (!item.collection && item.type !== 'DECREMENT_STOCK') {
            console.warn(`Dropping queue item with missing/invalid collection:`, item);
            if (dbKey !== undefined) await deleteLocal(QUEUE_COLLECTION, dbKey);
            continue;
          }

          if (item.type === 'ADD_PRODUCT' || item.type === 'ADD_CATEGORY' || item.type === 'ADD_AUDIT_LOG' || item.type === 'SEND_NOTICE') {
            const docRef = await addDoc(collection(db, item.collection), {
              ...sanitizedData,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            console.log(`Synced new ${item.collection} item to Firestore with ID:`, docRef.id);

            if (item.localId) {
              idMappings[item.localId] = docRef.id;

              if (item.type === 'ADD_PRODUCT') {
                await persistProductIdMapping(queueItems, item.localId, docRef.id);
              }

              const localItems = await getAllLocal(item.collection);
              const localMatch = localItems.find(i => i.id === item.localId);
              if (localMatch) {
                await deleteLocal(item.collection, item.localId);
                await saveLocal(item.collection, { ...localMatch, id: docRef.id, ...sanitizedData });
              }
            }
          } 
          else if (item.type === 'CREATE_PURCHASE_ORDER') {
            const remoteId = item.remoteId || doc(collection(db, item.collection)).id;
            const orderRef = doc(db, item.collection, remoteId);
            const orderData = {
              ...sanitizedData,
              items: (sanitizedData.items || []).map((orderItem) => ({
                ...orderItem,
                productId: idMappings[orderItem.productId] || orderItem.productId
              }))
            };

            await runTransaction(db, async (transaction) => {
              const existingOrder = await transaction.get(orderRef);
              if (!existingOrder.exists()) {
                transaction.set(orderRef, {
                  ...orderData,
                  createdAt: serverTimestamp()
                });
              }
            });

            idMappings[item.localId] = remoteId;
            const localOrders = await getAllLocal(item.collection);
            const localMatch = localOrders.find((order) => order.id === item.localId);
            if (localMatch) {
              await deleteLocal(item.collection, localMatch.id);
              await saveLocal(item.collection, {
                ...orderData,
                ...localMatch,
                id: remoteId,
                remoteId,
                items: orderData.items
              });
            }
          }
          else if (item.type === 'UPDATE_PURCHASE_ORDER') {
            const remoteId = item.remoteId || item.localId;
            const orderRef = doc(db, item.collection, String(remoteId));
            await runTransaction(db, async (transaction) => {
              const orderDoc = await transaction.get(orderRef);
              if (!orderDoc.exists()) throw new Error('Purchase order does not exist in Firestore.');
              const currentStatus = orderDoc.data().status;
              if (currentStatus === sanitizedData.status || currentStatus === 'received') return;
              if (currentStatus !== sanitizedData.expectedStatus) {
                throw new Error('Purchase order changed before this update could sync.');
              }
              const updateData = { ...sanitizedData };
              delete updateData.expectedStatus;
              transaction.update(orderRef, { ...updateData, syncedUpdatedAt: serverTimestamp() });
            });

            const localOrders = await getAllLocal(item.collection);
            const localMatch = localOrders.find((order) => order.id === item.localId || order.id === remoteId);
            if (localMatch) {
              if (localMatch.id !== remoteId) await deleteLocal(item.collection, localMatch.id);
              await saveLocal(item.collection, { ...localMatch, id: remoteId, remoteId });
            }
          }
          else if (item.type === 'RECEIVE_PURCHASE_ORDER') {
            const remoteId = item.remoteId || item.localId;
            const orderRef = doc(db, item.collection, String(remoteId));
            const cachedOrders = await getAllLocal(item.collection);
            const cachedOrder = cachedOrders.find((order) => (
              String(order.id) === String(item.orderLocalId) ||
              String(order.id) === String(remoteId) ||
              String(order.remoteId) === String(remoteId)
            ));
            const receiptItems = (sanitizedData.items || []).map((receiptItem) => ({
              ...receiptItem,
              productId: idMappings[receiptItem.productId] || receiptItem.productId
            }));
            const receivedOrderItems = (sanitizedData.orderItems || receiptItems).map((receivedItem) => ({
              ...receivedItem,
              productId: idMappings[receivedItem.productId] || receivedItem.productId
            }));
            let productUpdates = [];

            await runTransaction(db, async (transaction) => {
              const orderDoc = await transaction.get(orderRef);
              let orderData = orderDoc.exists() ? orderDoc.data() : null;
              if (!orderData) {
                if (!cachedOrder || cachedOrder.status !== 'received') {
                  throw new Error('Purchase order does not exist in Firestore, and no completed local receipt is available to recover it.');
                }
                orderData = { ...cachedOrder, status: 'ordered' };
              }
              if (orderData.status === 'received') return;
              if (orderData.status !== 'ordered') throw new Error('Purchase order is no longer awaiting receipt.');

              const requirements = new Map();
              for (const orderItem of receiptItems) {
                const requirement = requirements.get(orderItem.productId) || { name: orderItem.name, quantity: 0, incomingCost: 0 };
                requirement.quantity += Number(orderItem.quantity || 0);
                requirement.incomingCost += Number(orderItem.quantity || 0) * Number(orderItem.unitCost || 0);
                requirements.set(orderItem.productId, requirement);
              }

              const productDocs = [];
              for (const [productId, requirement] of requirements) {
                const productRef = doc(db, 'products', String(productId));
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) throw new Error(`Product ${requirement.name} no longer exists.`);
                const current = productDoc.data();
                const currentStock = Number(current.stock || 0);
                const nextStock = currentStock + requirement.quantity;
                const nextCost = nextStock > 0
                  ? (currentStock * Number(current.costPrice || 0) + requirement.incomingCost) / nextStock
                  : Number(current.costPrice || 0);
                productDocs.push({ productRef, productId, stock: nextStock, costPrice: nextCost });
              }

              for (const product of productDocs) {
                transaction.update(product.productRef, {
                  stock: product.stock,
                  costPrice: product.costPrice,
                  updatedAt: serverTimestamp()
                });
              }
              const receivedData = {
                status: 'received',
                items: receivedOrderItems,
                actualTotal: sanitizedData.actualTotal ?? receiptItems.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
                receivedAt: sanitizedData.receivedAt || new Date().toISOString(),
                receivedBy: sanitizedData.receivedBy || '',
                receivedByName: sanitizedData.receivedByName || '',
                syncedReceivedAt: serverTimestamp()
              };
              if (orderDoc.exists()) {
                transaction.update(orderRef, receivedData);
              } else {
                const recoveredOrder = { ...orderData };
                delete recoveredOrder.id;
                delete recoveredOrder.remoteId;
                transaction.set(orderRef, {
                  ...recoveredOrder,
                  ...receivedData,
                  createdAt: recoveredOrder.createdAt || serverTimestamp()
                });
              }
              productUpdates = productDocs;
            });

            for (const product of productUpdates) {
              const cachedProducts = await getAllLocal('products');
              const cachedProduct = cachedProducts.find((entry) => String(entry.id) === String(product.productId));
              if (cachedProduct) {
                await saveLocal('products', {
                  ...cachedProduct,
                  stock: product.stock,
                  costPrice: product.costPrice,
                  updatedAt: new Date().toISOString()
                });
              }
            }

            const localOrders = await getAllLocal(item.collection);
            const localMatch = localOrders.find((order) => (
              String(order.id) === String(item.orderLocalId) ||
              String(order.id) === String(remoteId) ||
              String(order.remoteId) === String(remoteId)
            ));
            if (localMatch) {
              if (localMatch.id !== remoteId) await deleteLocal(item.collection, localMatch.id);
              await saveLocal(item.collection, {
                ...localMatch,
                id: remoteId,
                remoteId,
                status: 'received',
                receivedAt: sanitizedData.receivedAt || localMatch.receivedAt,
                receivedBy: sanitizedData.receivedBy || localMatch.receivedBy,
                receivedByName: sanitizedData.receivedByName || localMatch.receivedByName,
                items: receivedOrderItems,
                actualTotal: sanitizedData.actualTotal ?? localMatch.actualTotal
              });
            }
          }
          else if (item.type === 'CANCEL_PURCHASE_ORDER') {
            const remoteId = item.remoteId || item.localId;
            const orderRef = doc(db, item.collection, String(remoteId));
            await runTransaction(db, async (transaction) => {
              const orderDoc = await transaction.get(orderRef);
              if (!orderDoc.exists()) throw new Error('Purchase order does not exist in Firestore.');
              const status = orderDoc.data().status;
              if (status === 'cancelled') return;
              if (status !== 'ordered') throw new Error('Purchase order is no longer awaiting action.');
              transaction.update(orderRef, {
                ...sanitizedData,
                syncedCancelledAt: serverTimestamp()
              });
            });

            const localOrders = await getAllLocal(item.collection);
            const localMatch = localOrders.find((order) => order.id === item.localId || order.id === remoteId);
            if (localMatch) {
              if (localMatch.id !== remoteId) await deleteLocal(item.collection, localMatch.id);
              await saveLocal(item.collection, {
                ...localMatch,
                id: remoteId,
                remoteId,
                ...sanitizedData
              });
            }
          }
          else if (item.type === 'COMPLETE_SALE') {
            const remoteSaleId = item.remoteId || doc(collection(db, item.collection)).id;
            const saleRef = doc(db, item.collection, remoteSaleId);

            if (item.atomicStock) {
              const deviceId = item.deviceId || sanitizedData.deviceId || null;
              await runTransaction(db, async (transaction) => {
                const existingSale = await transaction.get(saleRef);
                if (existingSale.exists()) return;

                if (deviceId) {
                  const deviceRef = doc(db, 'posDevices', String(deviceId));
                  const deviceDoc = await transaction.get(deviceRef);
                  if (!deviceDoc.exists() || deviceDoc.data().active === false) {
                    throw new Error('The POS terminal is not registered or has been disabled.');
                  }
                }

                const requirements = new Map();
                for (const saleItem of sanitizedData.items || []) {
                  const requirement = requirements.get(saleItem.productId) || { name: saleItem.name, units: 0 };
                  requirement.units += Number(saleItem.unitsDeducted || saleItem.quantity || 0);
                  requirements.set(saleItem.productId, requirement);
                }

                const productDocs = [];
                for (const [productId, requirement] of requirements) {
                  const productRef = doc(db, 'products', String(productId));
                  const productDoc = await transaction.get(productRef);
                  if (!productDoc.exists()) {
                    throw new Error(`Product ${requirement.name} (${productId}) is missing in Firestore; its queued product ID may need reconciliation.`);
                  }
                  if (productDoc.data().isActive === false) {
                    throw new Error(`Product ${requirement.name} is no longer available.`);
                  }

                  const productData = productDoc.data();
                  const currentStock = Number(productData.stock || 0);
                  const reservedUnits = Number(productData.offlineReservedUnits || 0);
                  const allocationRef = deviceId
                    ? doc(db, 'offlineStockAllocations', getOfflineAllocationId(String(deviceId), String(productId)))
                    : null;
                  const allocationDoc = allocationRef ? await transaction.get(allocationRef) : null;
                  const ownAllocation = allocationDoc?.exists()
                    ? Number(allocationDoc.data().remainingUnits || 0)
                    : 0;
                  const allocatedUnits = Math.min(ownAllocation, requirement.units);
                  const unreservedUnitsNeeded = requirement.units - allocatedUnits;
                  const availableUnits = Math.max(0, currentStock - reservedUnits);
                  if (availableUnits < unreservedUnitsNeeded) {
                    throw new Error(`Insufficient available stock for ${requirement.name}. Required units: ${requirement.units}, Available: ${availableUnits + allocatedUnits}`);
                  }
                  productDocs.push({
                    productRef,
                    allocationRef,
                    currentStock,
                    reservedUnits,
                    ownAllocation,
                    allocatedUnits,
                    units: requirement.units
                  });
                }

                for (const product of productDocs) {
                  const nextStock = product.currentStock - product.units;
                  const nextReservedUnits = Math.max(0, product.reservedUnits - product.allocatedUnits);
                  transaction.update(product.productRef, {
                    stock: nextStock,
                    offlineReservedUnits: nextReservedUnits,
                    updatedAt: serverTimestamp()
                  });
                  if (product.allocatedUnits > 0) {
                    transaction.update(product.allocationRef, {
                      remainingUnits: product.ownAllocation - product.allocatedUnits,
                      updatedAt: serverTimestamp()
                    });
                  }
                }
                transaction.set(saleRef, {
                  ...sanitizedData,
                  createdAt: serverTimestamp()
                });
              });
            } else {
              await setDoc(saleRef, {
                ...sanitizedData,
                createdAt: serverTimestamp()
              });
            }
            console.log(`Synced offline sale to Firestore with ID:`, remoteSaleId);

            if (item.localId) {
              idMappings[item.localId] = remoteSaleId;

              const localSales = await getAllLocal(item.collection);
              const localMatch = localSales.find(s => s.id === item.localId || s.id === targetId);
              
              if (localMatch) {
                await deleteLocal(item.collection, localMatch.id);
                await saveLocal(item.collection, { 
                  ...localMatch, 
                  id: remoteSaleId, 
                  ...sanitizedData,
                  createdAt: localMatch.createdAt || new Date().toISOString()
                });
              }
            }
          }
          else if (item.type === 'DECREMENT_STOCK') {
            if (item.localSaleId && legacySaleIds.has(item.localSaleId)) {
              console.warn(`Skipping duplicate legacy stock decrement for sale: ${item.localSaleId}`);
              if (dbKey !== undefined) await deleteLocal(QUEUE_COLLECTION, dbKey);
              continue;
            }

            const productRef = doc(db, 'products', String(item.productId));
            const { increment } = await import('firebase/firestore');
            
            await updateDoc(productRef, {
              stock: increment(-Math.abs(Number(item.quantitySold || 0))),
              updatedAt: serverTimestamp()
            });
            console.log(`Synced atomic offline stock decrement for product: ${item.productId} by -${item.quantitySold}`);
          }
          else if (item.type === 'RETURN_SALE') {
            const saleRef = doc(db, item.collection, String(item.saleId));
            const { getDoc, runTransaction } = await import('firebase/firestore');
            const saleDoc = await getDoc(saleRef);

            if (saleDoc.exists() && saleDoc.data().status !== 'returned') {
              const saleData = saleDoc.data();
              
              await runTransaction(db, async (transaction) => {
                const restockOps = [];
                for (const prodItem of saleData.items) {
                  const productRef = doc(db, 'products', prodItem.productId);
                  const productDoc = await transaction.get(productRef);

                  if (productDoc.exists()) {
                    const currentStock = Number(productDoc.data().stock || 0);
                    const unitsToRestock = prodItem.unitsDeducted || prodItem.quantity;
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
                  returnedBy: item.cashierId || 'admin'
                });
              });
              console.log(`Synced offline return for sale ID:`, item.saleId);
            }
          }
          else if (item.type === 'UPDATE_PRODUCT') {
            const docRef = doc(db, item.collection, String(targetId));
            const productUpdate = { ...sanitizedData };
            if (productUpdate.stock === null) delete productUpdate.stock;
            if (productUpdate.stock !== undefined) {
              await runTransaction(db, async (transaction) => {
                const productDoc = await transaction.get(docRef);
                if (!productDoc.exists()) throw new Error('Product no longer exists.');
                const reservedUnits = Number(productDoc.data().offlineReservedUnits || 0);
                const requestedStock = Number(productUpdate.stock);
                if (!Number.isFinite(requestedStock) || requestedStock < reservedUnits) {
                  throw new Error(`Stock cannot be set below ${reservedUnits} units reserved for offline terminals.`);
                }
                transaction.update(docRef, {
                  ...productUpdate,
                  updatedAt: serverTimestamp()
                });
              });
            } else {
              await updateDoc(docRef, {
                ...productUpdate,
                updatedAt: serverTimestamp()
              });
            }
          } 
          else if (item.type === 'ADJUST_STOCK') {
            const docRef = doc(db, item.collection, String(targetId));
            await runTransaction(db, async (transaction) => {
              const productDoc = await transaction.get(docRef);
              if (!productDoc.exists()) throw new Error('Product no longer exists.');
              const productData = productDoc.data();
              const nextStock = Number(productData.stock || 0) + Number(item.amount);
              const reservedUnits = Number(productData.offlineReservedUnits || 0);
              if (nextStock < reservedUnits) {
                throw new Error('This adjustment would consume stock reserved for offline terminals.');
              }
              const adjustment = Number(item.amount);
              const productUpdate = {
                stock: nextStock,
                updatedAt: serverTimestamp()
              };
              if (!item.preserveCost) {
                const incomingCost = Number(sanitizedData.costPrice || 0);
                const previousStock = Number(productData.stock || 0);
                const previousCost = Number(productData.costPrice || 0);
                const nextCost = nextStock > 0
                  ? ((previousStock * previousCost) + (adjustment * incomingCost)) / nextStock
                  : incomingCost;
                Object.assign(productUpdate, {
                  costPrice: nextCost,
                  lastStockAdjustmentAt: sanitizedData.adjustmentDate || new Date().toISOString(),
                  lastStockAdjustmentQuantity: adjustment,
                  lastStockAdjustmentCostPrice: incomingCost
                });
              }
              transaction.update(docRef, productUpdate);
            });
          }
          else if (item.type === 'DELETE_PRODUCT') {
            const docRef = doc(db, item.collection, String(targetId));
            await deleteDoc(docRef);
          }
          else if (item.type === 'UPDATE_SETTINGS') {
            const docRef = doc(db, item.collection, String(item.remoteId || 'store_config'));
            await setDoc(docRef, {
              ...sanitizedData,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
          else if (item.type === 'DELETE_NOTIFICATION') {
            await deleteDoc(doc(db, item.collection, String(item.remoteId)));
          }

          // Successfully processed, remove item using its real database autoIncrement key
          if (dbKey !== undefined) {
            await deleteLocal(QUEUE_COLLECTION, dbKey);
          }
        } catch (itemError) {
          console.error(`Failed to sync queue item (${item.type}):`, itemError);
          
          if (
            itemError.code === 'invalid-argument' || 
            itemError.code === 'not-found' || 
            itemError instanceof TypeError ||
            (itemError.message && itemError.message.includes('indexOf'))
          ) {
            console.warn(`Purging unrecoverable queue item [${item.type}] due to error:`, itemError.code || itemError.message);
            if (dbKey !== undefined) {
              await deleteLocal(QUEUE_COLLECTION, dbKey);
            }
          }
        }
      }
      console.log("Offline queue synchronization completed.");
    } catch (error) {
      console.error("Error syncing offline queue:", error);
    } finally {
      syncInProgress = false;
    }
  }
};

window.addEventListener('online', () => {
  console.log("Connection restored. Triggering background sync...");
  syncService.syncPendingQueue();
});