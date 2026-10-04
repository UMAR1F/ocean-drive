// src/services/productService.js
import { auth, db } from '../firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  increment,
  runTransaction,
  serverTimestamp 
} from 'firebase/firestore';
import { offlineDb } from './offlineDb';
import { syncService } from './syncService';
import { auditService } from './auditService';

const COLLECTION_NAME = 'products';
const CATEGORIES_COLLECTION = 'categories';

// Helper to strip undefined values which cause Firestore crashes
const sanitizeData = (data) => {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key, 
      value === undefined ? null : value
    ])
  );
};

export const productService = {
  async getAllProducts() {
    try {
      let rawProducts = [];
      let categoriesMap = {};

      if (!navigator.onLine) {
        console.log("Offline: Fetching products and categories from local DB");
        rawProducts = await offlineDb.getAll(COLLECTION_NAME);
        const localCategories = await offlineDb.getAll(CATEGORIES_COLLECTION) || [];
        localCategories.forEach(cat => {
          categoriesMap[cat.id] = cat.name || cat.title || cat.categoryName;
        });
      } else {
        console.log("Online: Fetching products and categories from Firestore...");
        
        // Fetch categories first to build a lookup map (id -> name)
        const catSnapshot = await getDocs(collection(db, CATEGORIES_COLLECTION));
        catSnapshot.docs.forEach(docSnap => {
          const catData = docSnap.data();
          const catName = catData.name || catData.title || catData.categoryName || 'Uncategorized';
          categoriesMap[docSnap.id] = catName;
          offlineDb.put(CATEGORIES_COLLECTION, { id: docSnap.id, ...catData });
        });

        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        rawProducts = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      }

      // Map categoryId or existing fields to categoryName
      let products = rawProducts.map(product => {
        let resolvedCategory = 'Uncategorized';

        if (product.categoryId && categoriesMap[product.categoryId]) {
          resolvedCategory = categoriesMap[product.categoryId];
        } else if (product.categoryName && product.categoryName.trim() !== '') {
          resolvedCategory = product.categoryName;
        } else if (product.category && typeof product.category === 'string' && product.category.trim() !== '') {
          resolvedCategory = product.category;
        } else if (product.category?.name) {
          resolvedCategory = product.category.name;
        }

        return {
          ...product,
          categoryName: resolvedCategory
        };
      });
      
      products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      for (const product of products) {
        await offlineDb.put(COLLECTION_NAME, product);
      }
      return products;
    } catch (error) {
      console.warn("Firestore fetch failed, falling back to local DB:", error);
      const localProducts = await offlineDb.getAll(COLLECTION_NAME);
      return localProducts.map(product => ({
        ...product,
        categoryName: product.categoryName || product.category || 'Uncategorized'
      }));
    }
  },

  async addProduct(productData) {
    const timestamp = new Date().toISOString();
    
    const rawData = {
      entryMode: productData.entryMode || 'wholesale',
      name: productData.name ? productData.name.trim() : '',
      sku: productData.sku || '',
      barcode: productData.barcode || '',
      categoryId: productData.categoryId || null,
      categoryName: productData.categoryName || productData.category || 'Uncategorized',
      costPrice: Number(productData.costPrice) || 0,
      sellingPrice: Number(productData.sellingPrice) || 0,
      wholesalePrice: Number(productData.wholesalePrice) || 0,
      price: productData.price !== undefined && productData.price !== '' ? Number(productData.price) : null,
      uom: productData.uom || 'Pieces',
      itemsPerPack: Number(productData.itemsPerPack) || 1,
      stock: Number(productData.stock) || 0,
      openingStock: productData.openingStock !== undefined && productData.openingStock !== '' ? Number(productData.openingStock) : null,
      reorderPoint: Number(productData.reorderPoint) || 5,
      minStockAlert: productData.minStockAlert !== undefined && productData.minStockAlert !== '' ? Number(productData.minStockAlert) : null,
      location: productData.location || '',
      supplierName: productData.supplierName || '',
      isActive: productData.isActive !== undefined ? Boolean(productData.isActive) : true,
      hasCarton: Boolean(productData.hasCarton),
      hasCrate: Boolean(productData.hasCrate),
      piecesPerCarton: productData.piecesPerCarton !== undefined && productData.piecesPerCarton !== '' ? Number(productData.piecesPerCarton) : null,
      piecesPerCrate: productData.piecesPerCrate !== undefined && productData.piecesPerCrate !== '' ? Number(productData.piecesPerCrate) : null,
      pricePerCarton: productData.pricePerCarton !== undefined && productData.pricePerCarton !== '' ? Number(productData.pricePerCarton) : null,
      pricePerCrate: productData.pricePerCrate !== undefined && productData.pricePerCrate !== '' ? Number(productData.pricePerCrate) : null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const cleanData = sanitizeData(rawData);

    try {
      if (!navigator.onLine) {
        console.log("Offline: Adding product locally");
        const localId = await offlineDb.add(COLLECTION_NAME, cleanData);
        await syncService.addToQueue({ type: 'ADD_PRODUCT', collection: COLLECTION_NAME, data: cleanData, localId });
        return { id: localId, ...cleanData };
      }

      console.log("Online: Saving product to Firestore...");
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...cleanData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      const savedProduct = { id: docRef.id, ...cleanData };
      
      await offlineDb.put(COLLECTION_NAME, savedProduct);
      return savedProduct;
    } catch (error) {
      console.error("Firestore write failed, falling back to local DB:", error);
      if (navigator.onLine && ['permission-denied', 'unauthenticated'].includes(error?.code)) {
        throw new Error('You do not have permission to add products. Sign in as an administrator or manager.');
      }
      const localId = await offlineDb.add(COLLECTION_NAME, cleanData);
      await syncService.addToQueue({ type: 'ADD_PRODUCT', collection: COLLECTION_NAME, data: cleanData, localId });
      return { id: localId, ...cleanData };
    }
  },

  async updateProduct(id, updatedData) {
    if (!id) {
      console.error("Cannot update product: Missing ID", id);
      return;
    }

    const stringId = String(id);
    const timestamp = new Date().toISOString();
    
    const rawData = {
      ...updatedData,
      name: updatedData.name !== undefined ? updatedData.name.trim() : undefined,
      categoryId: updatedData.categoryId !== undefined ? updatedData.categoryId : undefined,
      categoryName: updatedData.categoryName !== undefined ? updatedData.categoryName : (updatedData.category !== undefined ? updatedData.category : undefined),
      costPrice: updatedData.costPrice !== undefined ? Number(updatedData.costPrice) : undefined,
      sellingPrice: updatedData.sellingPrice !== undefined ? Number(updatedData.sellingPrice) : undefined,
      wholesalePrice: updatedData.wholesalePrice !== undefined ? Number(updatedData.wholesalePrice) : undefined,
      price: updatedData.price !== undefined ? (updatedData.price !== '' ? Number(updatedData.price) : null) : undefined,
      itemsPerPack: updatedData.itemsPerPack !== undefined ? Number(updatedData.itemsPerPack) : undefined,
      stock: updatedData.stock !== undefined ? Number(updatedData.stock) : undefined,
      openingStock: updatedData.openingStock !== undefined ? (updatedData.openingStock !== '' ? Number(updatedData.openingStock) : null) : undefined,
      reorderPoint: updatedData.reorderPoint !== undefined ? Number(updatedData.reorderPoint) : undefined,
      minStockAlert: updatedData.minStockAlert !== undefined ? (updatedData.minStockAlert !== '' ? Number(updatedData.minStockAlert) : null) : undefined,
      isActive: updatedData.isActive !== undefined ? Boolean(updatedData.isActive) : undefined,
      hasCarton: updatedData.hasCarton !== undefined ? Boolean(updatedData.hasCarton) : undefined,
      hasCrate: updatedData.hasCrate !== undefined ? Boolean(updatedData.hasCrate) : undefined,
      piecesPerCarton: updatedData.piecesPerCarton !== undefined ? (updatedData.piecesPerCarton !== '' ? Number(updatedData.piecesPerCarton) : null) : undefined,
      piecesPerCrate: updatedData.piecesPerCrate !== undefined ? (updatedData.piecesPerCrate !== '' ? Number(updatedData.piecesPerCrate) : null) : undefined,
      pricePerCarton: updatedData.pricePerCarton !== undefined ? (updatedData.pricePerCarton !== '' ? Number(updatedData.pricePerCarton) : null) : undefined,
      pricePerCrate: updatedData.pricePerCrate !== undefined ? (updatedData.pricePerCrate !== '' ? Number(updatedData.pricePerCrate) : null) : undefined,
      updatedAt: timestamp
    };

    const formattedData = sanitizeData(rawData);
    if (updatedData.stock === undefined) delete formattedData.stock;

    if (updatedData.stock !== undefined) {
      const requestedStock = Number(formattedData.stock);
      if (!Number.isFinite(requestedStock) || requestedStock < 0) {
        throw new Error('Stock must be a non-negative number.');
      }
      if (navigator.onLine) {
        const productRef = doc(db, COLLECTION_NAME, stringId);
        await runTransaction(db, async (transaction) => {
          const productSnapshot = await transaction.get(productRef);
          if (!productSnapshot.exists()) throw new Error('Product no longer exists.');
          const reservedUnits = Number(productSnapshot.data().offlineReservedUnits || 0);
          if (requestedStock < reservedUnits) {
            throw new Error(`Stock cannot be set below ${reservedUnits} units reserved for offline terminals.`);
          }
          transaction.update(productRef, {
            ...formattedData,
            updatedAt: serverTimestamp()
          });
        });
        await offlineDb.update(COLLECTION_NAME, id, formattedData);
        return;
      }

      const localProducts = await offlineDb.getAll(COLLECTION_NAME);
      const localProduct = localProducts.find((product) => String(product.id) === stringId);
      if (!localProduct || requestedStock < Number(localProduct.offlineReservedUnits || 0)) {
        throw new Error('Connect to the internet to change stock reserved for offline terminals.');
      }
    }

    try {
      await offlineDb.update(COLLECTION_NAME, id, formattedData);

      if (!navigator.onLine) {
        console.log("Offline: Queuing product update");
        await syncService.addToQueue({ type: 'UPDATE_PRODUCT', collection: COLLECTION_NAME, id: stringId, data: formattedData });
        return;
      }

      console.log("Online: Updating product in Firestore for ID:", stringId);
      const docRef = doc(db, COLLECTION_NAME, stringId);
      
      try {
        await updateDoc(docRef, {
          ...formattedData,
          updatedAt: serverTimestamp()
        });
        console.log("Firestore update successful.");
      } catch (firestoreError) {
        console.warn("Document not found on Firestore yet, queuing update instead:", firestoreError);
        await syncService.addToQueue({ type: 'UPDATE_PRODUCT', collection: COLLECTION_NAME, id: stringId, data: formattedData });
      }
    } catch (error) {
      console.error("Error updating product:", error);
    }
  },

  async adjustStock(id, amount, { costPrice = 0, adjustmentDate = new Date().toISOString().slice(0, 10) } = {}) {
    const adjustment = Number(amount);
    if (!id || !Number.isFinite(adjustment) || adjustment === 0) return { queued: false };
    const stringId = String(id);
    const incomingCost = Number(costPrice);
    if (!Number.isFinite(incomingCost) || incomingCost < 0) throw new Error('Enter a valid cost price.');
    const normalizedDate = new Date(`${adjustmentDate}T12:00:00`);
    if (Number.isNaN(normalizedDate.getTime())) throw new Error('Enter a valid stock update date.');
    const adjustmentData = {
      costPrice: incomingCost,
      adjustmentDate: normalizedDate.toISOString()
    };
    if (!navigator.onLine) {
      const products = await offlineDb.getAll(COLLECTION_NAME);
      const product = products.find((item) => String(item.id) === stringId);
      const nextStock = Number(product?.stock || 0) + adjustment;
      if (!product || nextStock < Number(product.offlineReservedUnits || 0)) {
        throw new Error('This adjustment would consume stock reserved for offline terminals.');
      }
      await offlineDb.adjustStock(COLLECTION_NAME, id, adjustment);
      const previousStock = Number(product.stock || 0);
      const previousCost = Number(product.costPrice || 0);
      const nextCost = nextStock > 0
        ? ((previousStock * previousCost) + (adjustment * incomingCost)) / nextStock
        : incomingCost;
      await offlineDb.update(COLLECTION_NAME, id, {
        costPrice: nextCost,
        lastStockAdjustmentAt: normalizedDate.toISOString(),
        lastStockAdjustmentQuantity: adjustment,
        lastStockAdjustmentCostPrice: incomingCost
      });
      await syncService.addToQueue({ type: 'ADJUST_STOCK', collection: COLLECTION_NAME, id: stringId, amount: adjustment, data: adjustmentData });
      await auditService.logAction({
        actionType: 'STOCK_ADJUSTED_OFFLINE',
        entityId: stringId,
        entityName: product.name || stringId,
        details: `Added ${adjustment} units at cost ₦${incomingCost.toFixed(2)} on ${adjustmentDate}.`,
        user: auth.currentUser
      });
      return { queued: true };
    }

    const docRef = doc(db, COLLECTION_NAME, stringId);
    let updatedProduct;
    await runTransaction(db, async (transaction) => {
      const productSnapshot = await transaction.get(docRef);
      if (!productSnapshot.exists()) throw new Error('Product no longer exists.');
      const productData = productSnapshot.data();
      const nextStock = Number(productData.stock || 0) + adjustment;
      const reservedUnits = Number(productData.offlineReservedUnits || 0);
      if (nextStock < reservedUnits) {
        throw new Error('This adjustment would consume stock reserved for offline terminals.');
      }
      const previousStock = Number(productData.stock || 0);
      const previousCost = Number(productData.costPrice || 0);
      const nextCost = nextStock > 0
        ? ((previousStock * previousCost) + (adjustment * incomingCost)) / nextStock
        : incomingCost;
      transaction.update(docRef, {
        stock: increment(adjustment),
        costPrice: nextCost,
        lastStockAdjustmentAt: normalizedDate.toISOString(),
        lastStockAdjustmentQuantity: adjustment,
        lastStockAdjustmentCostPrice: incomingCost,
        updatedAt: serverTimestamp()
      });
      updatedProduct = { ...productData, id: stringId, stock: nextStock, costPrice: nextCost, lastStockAdjustmentAt: normalizedDate.toISOString() };
    });
    await offlineDb.put(COLLECTION_NAME, updatedProduct);
    await auditService.logAction({
      actionType: 'STOCK_ADJUSTED',
      entityId: stringId,
      entityName: updatedProduct.name || stringId,
      details: `Added ${adjustment} units at cost ₦${incomingCost.toFixed(2)} on ${adjustmentDate}.`,
      user: auth.currentUser
    });
    return { queued: false };
  },

  async deleteProduct(id, ...args) {
    let idArg = id;
    if (!idArg && args.length > 0) {
      idArg = args[0];
    }
    if (!idArg) return;
    const stringId = String(idArg);

    try {
      await offlineDb.delete(COLLECTION_NAME, idArg);

      if (!navigator.onLine) {
        await syncService.addToQueue({ type: 'DELETE_PRODUCT', collection: COLLECTION_NAME, id: stringId });
        return;
      }

      const docRef = doc(db, COLLECTION_NAME, stringId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  }
};