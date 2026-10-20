// Hardened Lightweight IndexedDB wrapper for local caching and offline operations

const DB_NAME = 'ClientInventoryOfflineDB';
const DB_VERSION = 8;

// Helper to generate a unique string ID for offline-created items
const generateOfflineId = () => {
  return 'offline_' + (window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now() + Math.random().toString(36).substring(2, 9));
};

export const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    }

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('sku', 'sku', { unique: false });
        productStore.createIndex('categoryId', 'categoryId', { unique: false });
      }

      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('sales')) {
        db.createObjectStore('sales', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('purchase_orders')) {
        db.createObjectStore('purchase_orders', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('offlineQueue')) {
        db.createObjectStore('offlineQueue', { keyPath: 'localId', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('offlineTransactions')) {
        db.createObjectStore('offlineTransactions', { keyPath: 'localId', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('settingsCache')) {
        db.createObjectStore('settingsCache', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('audit_logs')) {
        const auditStore = db.createObjectStore('audit_logs', { keyPath: 'id' });
        auditStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Added 'notifications' object store for offline staff broadcasts and voice notes cache
      if (!db.objectStoreNames.contains('notifications')) {
        const notificationStore = db.createObjectStore('notifications', { keyPath: 'id' });
        notificationStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('posDevices')) {
        db.createObjectStore('posDevices', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('offlineStockAllocations')) {
        db.createObjectStore('offlineStockAllocations', { keyPath: 'id' });
      }
    };
  });
};

export const getAllLocal = async (storeName) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error(`Transaction aborted on store: ${storeName}`));
  });
};

export const saveLocal = async (storeName, item) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      reject(new Error(`Object store "${storeName}" not found in local DB`));
      return;
    }
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    
    const itemToSave = {
      ...item,
      id: item.id || generateOfflineId()
    };

    const request = store.put(itemToSave);

    request.onsuccess = () => resolve(itemToSave.id);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error(`Transaction aborted on store: ${storeName}`));
  });
};

export const addLocal = async (storeName, item) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      reject(new Error(`Object store "${storeName}" not found in local DB`));
      return;
    }
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    
    const itemToSave = {
      ...item,
      id: item.id || generateOfflineId()
    };

    const request = store.put(itemToSave);

    request.onsuccess = () => resolve(itemToSave.id);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error(`Transaction aborted on store: ${storeName}`));
  });
};

export const updateLocal = async (storeName, id, updatedData) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      reject(new Error(`Object store "${storeName}" not found in local DB`));
      return;
    }
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result || {};
      const updated = { ...existing, ...updatedData, id };
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(putRequest.result);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error(`Transaction aborted on store: ${storeName}`));
  });
};

export const adjustStockLocal = async (storeName, id, amount) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      reject(new Error(`Object store "${storeName}" not found in local DB`));
      return;
    }
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (!item) {
        reject(new Error(`Item with id ${id} not found in local DB`));
        return;
      }
      item.stock = (Number(item.stock) || 0) + Number(amount);
      item.updatedAt = new Date().toISOString();
      
      const putRequest = store.put(item);
      putRequest.onsuccess = () => resolve(item);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error(`Transaction aborted on store: ${storeName}`));
  });
};

export const consumeOfflineAllocationLocal = async (deviceId, requirements) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const requiredStores = ['products', 'posDevices', 'offlineStockAllocations'];
    if (requiredStores.some((storeName) => !db.objectStoreNames.contains(storeName))) {
      reject(new Error('Offline stock allocation data is not available on this terminal.'));
      return;
    }

    const transaction = db.transaction(requiredStores, 'readwrite');
    const productStore = transaction.objectStore('products');
    const deviceStore = transaction.objectStore('posDevices');
    const allocationStore = transaction.objectStore('offlineStockAllocations');
    const pendingReads = requirements.length * 2 + 1;
    const records = [];
    let completedReads = 0;
    let validationError = null;

    const fail = (message) => {
      validationError = new Error(message);
      transaction.abort();
    };

    transaction.oncomplete = () => resolve(records);
    transaction.onerror = () => reject(validationError || transaction.error);
    transaction.onabort = () => reject(validationError || transaction.error || new Error('Offline stock update failed.'));

    const deviceRequest = deviceStore.get(deviceId);
    deviceRequest.onsuccess = () => {
      if (!deviceRequest.result || deviceRequest.result.active === false) {
        fail('Register this terminal online before making offline sales.');
        return;
      }
      completedReads += 1;
      if (completedReads === pendingReads) applyUpdates();
    };
    deviceRequest.onerror = () => fail('Could not read this terminal’s offline registration.');

    for (const requirement of requirements) {
      const productId = String(requirement.productId);
      const allocationId = `${deviceId}--${productId}`;
      const productRequest = productStore.get(requirement.productId);
      const allocationRequest = allocationStore.get(allocationId);
      const entry = { requirement, productRequest, allocationRequest };
      records.push(entry);

      productRequest.onsuccess = () => {
        completedReads += 1;
        if (completedReads === pendingReads) applyUpdates();
      };
      productRequest.onerror = () => fail(`Could not read cached stock for ${requirement.name}.`);
      allocationRequest.onsuccess = () => {
        completedReads += 1;
        if (completedReads === pendingReads) applyUpdates();
      };
      allocationRequest.onerror = () => fail(`Could not read the offline allocation for ${requirement.name}.`);
    }

    const applyUpdates = () => {
      if (validationError) return;
      for (const entry of records) {
        const { requirement, productRequest, allocationRequest } = entry;
        const product = productRequest.result;
        const allocation = allocationRequest.result;
        const units = Number(requirement.units);
        if (!product || product.isActive === false) {
          fail(`Product ${requirement.name} is no longer available on this terminal.`);
          return;
        }
        if (!allocation || Number(allocation.remainingUnits || 0) < units) {
          fail(`Insufficient offline allocation for ${requirement.name}.`);
          return;
        }
        if ((Number(product.stock) || 0) < units) {
          fail(`Insufficient cached stock for ${requirement.name}.`);
          return;
        }
      }

      for (const entry of records) {
        const product = entry.productRequest.result;
        const allocation = entry.allocationRequest.result;
        const units = Number(entry.requirement.units);
        productStore.put({
          ...product,
          stock: (Number(product.stock) || 0) - units,
          offlineReservedUnits: Math.max(0, Number(product.offlineReservedUnits || 0) - units),
          updatedAt: new Date().toISOString()
        });
        allocationStore.put({
          ...allocation,
          remainingUnits: Number(allocation.remainingUnits || 0) - units,
          updatedAt: new Date().toISOString()
        });
      }
    };
  });
};

export const deleteLocal = async (storeName, id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve();
      return;
    }
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error(`Transaction aborted on store: ${storeName}`));
  });
};

// Unified export matching everything productService and syncService expect
export const offlineDb = {
  getAll: getAllLocal,
  put: saveLocal,
  add: addLocal,
  update: updateLocal,
  adjustStock: adjustStockLocal,
  consumeOfflineAllocation: consumeOfflineAllocationLocal,
  delete: deleteLocal,
  saveLocal,
  deleteLocal,
  getAllLocal
};