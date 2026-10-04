// src/services/inventoryService.js
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  runTransaction,
  serverTimestamp 
} from 'firebase/firestore';
import { offlineDb } from './offlineDb';
import { syncService } from './syncService';

const COLLECTION_NAME = 'products';
const CATEGORIES_COLLECTION = 'categories';

export const inventoryService = {
  // --- PRODUCTS ---

  async getAllProducts() {
    try {
      if (!navigator.onLine) {
        console.log("Offline: Fetching products from local DB");
        return await offlineDb.getAll(COLLECTION_NAME);
      }

      console.log("Online: Fetching products from Firestore...");
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      let products = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      
      products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      // Cache products locally
      for (const product of products) {
        await offlineDb.put(COLLECTION_NAME, product);
      }
      return products;
    } catch (error) {
      console.warn("Firestore fetch failed, falling back to local DB:", error);
      return await offlineDb.getAll(COLLECTION_NAME);
    }
  },

  async addProduct(productData) {
    const timestamp = new Date().toISOString();
    const initialStock = Number(productData.stock) || 0;
    
    const cleanData = {
      entryMode: productData.entryMode || 'wholesale',
      name: productData.name || '',
      categoryId: productData.categoryId || null,
      
      // Pricing Tier
      costPrice: Number(productData.costPrice) || 0,
      price: Number(productData.price) || 0, // Selling price per piece
      
      // Stock Control
      openingStock: productData.openingStock !== undefined && Number.isFinite(Number(productData.openingStock))
        ? Number(productData.openingStock)
        : initialStock,
      stock: initialStock, // Current live stock
      minStockAlert: Number(productData.minStockAlert) || 5, // Low stock warning threshold
      
      // SKU & Barcodes
      sku: productData.sku || '',
      
      // Optional Packaging Tiers (Cartons / Crates)
      hasCarton: Boolean(productData.hasCarton),
      piecesPerCarton: Number(productData.piecesPerCarton) || 12,
      pricePerCarton: Number(productData.pricePerCarton) || 0,
      
      hasCrate: Boolean(productData.hasCrate),
      piecesPerCrate: Number(productData.piecesPerCrate) || 24,
      pricePerCrate: Number(productData.pricePerCrate) || 0,

      createdAt: timestamp,
      updatedAt: timestamp
    };

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
    const formattedData = {
      ...updatedData,
      costPrice: updatedData.costPrice !== undefined ? Number(updatedData.costPrice) : undefined,
      price: updatedData.price !== undefined ? Number(updatedData.price) : undefined,
      stock: updatedData.stock !== undefined ? Number(updatedData.stock) : undefined,
      openingStock: updatedData.openingStock !== undefined ? Number(updatedData.openingStock) : undefined,
      minStockAlert: updatedData.minStockAlert !== undefined ? Number(updatedData.minStockAlert) : undefined,
      piecesPerCarton: updatedData.piecesPerCarton !== undefined ? Number(updatedData.piecesPerCarton) : undefined,
      pricePerCarton: updatedData.pricePerCarton !== undefined ? Number(updatedData.pricePerCarton) : undefined,
      piecesPerCrate: updatedData.piecesPerCrate !== undefined ? Number(updatedData.piecesPerCrate) : undefined,
      pricePerCrate: updatedData.pricePerCrate !== undefined ? Number(updatedData.pricePerCrate) : undefined,
      updatedAt: timestamp
    };
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
      await updateDoc(docRef, {
        ...formattedData,
        updatedAt: serverTimestamp()
      });
      console.log("Firestore update successful.");
    } catch (error) {
      console.error("Error updating product in Firestore, falling back to queue:", error);
      await syncService.addToQueue({ type: 'UPDATE_PRODUCT', collection: COLLECTION_NAME, id: stringId, data: formattedData });
    }
  },

  async adjustStock(id, amount) {
    if (!id) {
      console.error("Cannot adjust stock: Missing ID", id);
      return;
    }

    const stringId = String(id);
    const adjustment = Number(amount);
    if (!Number.isFinite(adjustment) || adjustment === 0) return { queued: false };
    if (!navigator.onLine) {
      const products = await offlineDb.getAll(COLLECTION_NAME);
      const product = products.find((item) => String(item.id) === stringId);
      const nextStock = Number(product?.stock || 0) + adjustment;
      if (!product || nextStock < Number(product.offlineReservedUnits || 0)) {
        throw new Error('This adjustment would consume stock reserved for offline terminals.');
      }
      await offlineDb.adjustStock(COLLECTION_NAME, id, adjustment);
      await syncService.addToQueue({ type: 'ADJUST_STOCK', collection: COLLECTION_NAME, id: stringId, amount: adjustment });
      return { queued: true };
    }

    const productRef = doc(db, COLLECTION_NAME, stringId);
    let updatedProduct;
    await runTransaction(db, async (transaction) => {
      const productSnapshot = await transaction.get(productRef);
      if (!productSnapshot.exists()) throw new Error('Product no longer exists.');
      const productData = productSnapshot.data();
      const nextStock = Number(productData.stock || 0) + adjustment;
      const reservedUnits = Number(productData.offlineReservedUnits || 0);
      if (nextStock < reservedUnits) {
        throw new Error('This adjustment would consume stock reserved for offline terminals.');
      }
      transaction.update(productRef, { stock: nextStock, updatedAt: serverTimestamp() });
      updatedProduct = { ...productData, id: stringId, stock: nextStock };
    });
    await offlineDb.put(COLLECTION_NAME, updatedProduct);
    return { queued: false };
  },

  async deleteProduct(id) {
    if (!id) {
      console.error("Cannot delete product: Missing ID", id);
      return;
    }

    const stringId = String(id);

    try {
      await offlineDb.delete(COLLECTION_NAME, id);

      if (!navigator.onLine) {
        console.log("Offline: Queuing product deletion");
        await syncService.addToQueue({ type: 'DELETE_PRODUCT', collection: COLLECTION_NAME, id: stringId });
        return;
      }

      console.log("Online: Deleting product from Firestore for ID:", stringId);
      const docRef = doc(db, COLLECTION_NAME, stringId);
      await deleteDoc(docRef);
      console.log("Firestore deletion successful.");
    } catch (error) {
      console.error("Error deleting product from Firestore, falling back to queue:", error);
      await syncService.addToQueue({ type: 'DELETE_PRODUCT', collection: COLLECTION_NAME, id: stringId });
    }
  },

  // --- CATEGORIES ---

  async getCategories() {
    try {
      if (!navigator.onLine) {
        return await offlineDb.getAll(CATEGORIES_COLLECTION);
      }
      const snapshot = await getDocs(collection(db, CATEGORIES_COLLECTION));
      let categories = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      
      categories.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      for (const cat of categories) {
        await offlineDb.put(CATEGORIES_COLLECTION, cat);
      }
      return categories;
    } catch (error) {
      console.warn("Firestore categories fetch failed, falling back to local DB:", error);
      return await offlineDb.getAll(CATEGORIES_COLLECTION);
    }
  },

  async addCategory(categoryData) {
    const timestamp = new Date().toISOString();
    const newCategory = {
      name: categoryData.name || '',
      slug: categoryData.slug || '',
      createdAt: timestamp
    };

    try {
      if (!navigator.onLine) {
        const localId = await offlineDb.add(CATEGORIES_COLLECTION, newCategory);
        await syncService.addToQueue({ type: 'ADD_CATEGORY', collection: CATEGORIES_COLLECTION, data: newCategory, localId });
        return { id: localId, ...newCategory };
      }

      const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
        ...newCategory,
        createdAt: serverTimestamp()
      });
      const savedCategory = { id: docRef.id, ...newCategory };
      await offlineDb.put(CATEGORIES_COLLECTION, savedCategory);
      return savedCategory;
    } catch (error) {
      console.error("Error adding category to Firestore:", error);
      const localId = await offlineDb.add(CATEGORIES_COLLECTION, newCategory);
      await syncService.addToQueue({ type: 'ADD_CATEGORY', collection: CATEGORIES_COLLECTION, data: newCategory, localId });
      return { id: localId, ...newCategory };
    }
  }
};