import { openDB } from './offlineDb';

const PRESERVED_STORES = new Set(['offlineQueue', 'offlineTransactions']);

export const cacheManagementService = {
  async clearAppCache() {
    const db = await openDB();
    let clearedStores = 0;
    try {
      const storesToClear = Array.from(db.objectStoreNames)
        .filter((storeName) => !PRESERVED_STORES.has(storeName));

      if (storesToClear.length) {
        await new Promise((resolve, reject) => {
          const transaction = db.transaction(storesToClear, 'readwrite');
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error('Could not clear local cached data.'));
          transaction.onabort = () => reject(transaction.error || new Error('Cache clearing was interrupted.'));
          storesToClear.forEach((storeName) => transaction.objectStore(storeName).clear());
        });
        clearedStores = storesToClear.length;
      }
    } finally {
      db.close();
    }

    let clearedBrowserCaches = 0;
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      const deleted = await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
      clearedBrowserCaches = deleted.filter(Boolean).length;
      if (deleted.some((wasDeleted) => !wasDeleted)) {
        throw new Error('Some browser cache entries could not be removed. Try again.');
      }
    }

    return { clearedStores, clearedBrowserCaches };
  },
};
