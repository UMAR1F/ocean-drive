// src/services/settingsService.js
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { offlineDb } from './offlineDb';
import { syncService } from './syncService';

const SETTINGS_COLLECTION = 'settings';
const SETTINGS_DOC_ID = 'store_config';
const LOCAL_STORE_NAME = 'settingsCache';

export const settingsService = {
  async getSettings() {
    try {
      if (navigator.onLine) {
        const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
        const snapshot = await getDoc(docRef);
        
        if (snapshot.exists()) {
          const settingsData = snapshot.data();
          // Cache settings locally for offline usage
          await offlineDb.put(LOCAL_STORE_NAME, { id: SETTINGS_DOC_ID, ...settingsData });
          return settingsData;
        }
      }

      // Fallback to local cache if offline or remote doc is missing
      console.log("Fetching settings from local cache...");
      const localData = await offlineDb.getAll(LOCAL_STORE_NAME);
      const found = localData.find(s => s.id === SETTINGS_DOC_ID);
      
      if (found) return found;

      // Default fallback settings profile
      return {
        businessName: 'Skylight Ethic Technology',
        address: 'Kaduna, Nigeria',
        phone: '+234 800 000 0000',
        email: 'Skylightethic@gmail.com',
        taxId: 'TIN-99887766',
        currency: '₦',
        vatRate: 7.5,
        receiptFooter: 'Goods sold in good condition are not returnable after 7 days.',
        autoPrint: true
      };
    } catch (error) {
      console.error("Failed to fetch settings, using defaults:", error);
      return {
        businessName: 'Skylight Ethic Technology',
        address: 'Kaduna, Nigeria',
        currency: '₦',
        vatRate: 7.5,
        receiptFooter: 'Thank you for your patronage!'
      };
    }
  },

  async saveSettings(newSettings, currentUser) {
    const isAdmin = currentUser?.role === 'admin' || currentUser?.isAdmin || currentUser?.userRole === 'admin';
    if (!isAdmin) {
      throw new Error("Unauthorized: Only administrators can modify store settings.");
    }

    const payload = {
      ...newSettings,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.uid || currentUser?.id || 'admin'
    };

    try {
      // Save locally first for robust offline resilience
      await offlineDb.put(LOCAL_STORE_NAME, { id: SETTINGS_DOC_ID, ...payload });

      if (navigator.onLine) {
        const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
        await setDoc(docRef, {
          ...payload,
          updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("Settings successfully synced to Firestore.");
      } else {
        await syncService.addToQueue({
          type: 'UPDATE_SETTINGS',
          collection: SETTINGS_COLLECTION,
          remoteId: SETTINGS_DOC_ID,
          data: payload
        });
        console.log("Offline: Settings saved locally. Will sync when online.");
      }

      return { success: true, message: 'Settings successfully updated.' };
    } catch (error) {
      console.error("Failed to save settings:", error);
      throw error;
    }
  }
};