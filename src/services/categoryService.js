// src/services/categoryService.js
import { db } from '../firebase';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { offlineDb } from './offlineDb';
import { syncService } from './syncService';

const CATEGORIES_COLLECTION = 'categories';

export const categoryService = {
  async getCategories() {
    try {
      if (!navigator.onLine) {
        console.log("Offline: Fetching categories from local DB");
        return await offlineDb.getAll(CATEGORIES_COLLECTION);
      }

      console.log("Online: Fetching categories from Firestore...");
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
        console.log("Offline: Adding category locally");
        const localId = await offlineDb.add(CATEGORIES_COLLECTION, newCategory);
        await syncService.addToQueue({ type: 'ADD_CATEGORY', collection: CATEGORIES_COLLECTION, data: newCategory, localId });
        return { id: localId, ...newCategory };
      }

      console.log("Online: Saving category to Firestore...");
      const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
        ...newCategory,
        createdAt: serverTimestamp()
      });
      const savedCategory = { id: docRef.id, ...newCategory };
      await offlineDb.put(CATEGORIES_COLLECTION, savedCategory);
      return savedCategory;
    } catch (error) {
      console.error("Error adding category to Firestore, falling back to local DB:", error);
      const localId = await offlineDb.add(CATEGORIES_COLLECTION, newCategory);
      await syncService.addToQueue({ type: 'ADD_CATEGORY', collection: CATEGORIES_COLLECTION, data: newCategory, localId });
      return { id: localId, ...newCategory };
    }
  },

  async updateCategory(id, categoryData) {
    const updatedData = {
      name: categoryData.name || '',
      slug: categoryData.slug || '',
      updatedAt: new Date().toISOString()
    };

    try {
      if (!navigator.onLine || String(id).startsWith('offline_')) {
        console.log("Offline or Local ID: Updating category locally");
        await offlineDb.update(CATEGORIES_COLLECTION, id, updatedData);
        await syncService.addToQueue({ type: 'UPDATE_CATEGORY', collection: CATEGORIES_COLLECTION, id, data: updatedData });
        return { id, ...updatedData };
      }

      console.log("Online: Updating category in Firestore...");
      const docRef = doc(db, CATEGORIES_COLLECTION, id);
      await updateDoc(docRef, {
        ...updatedData,
        updatedAt: serverTimestamp()
      });
      
      const savedCategory = { id, ...updatedData };
      await offlineDb.put(CATEGORIES_COLLECTION, savedCategory);
      return savedCategory;
    } catch (error) {
      console.error("Error updating category in Firestore, falling back to local DB:", error);
      await offlineDb.update(CATEGORIES_COLLECTION, id, updatedData);
      await syncService.addToQueue({ type: 'UPDATE_CATEGORY', collection: CATEGORIES_COLLECTION, id, data: updatedData });
      return { id, ...updatedData };
    }
  },

  async deleteCategory(id) {
    try {
      if (!navigator.onLine || String(id).startsWith('offline_')) {
        console.log("Offline or Local ID: Deleting category locally");
        await offlineDb.delete(CATEGORIES_COLLECTION, id);
        await syncService.addToQueue({ type: 'DELETE_CATEGORY', collection: CATEGORIES_COLLECTION, id });
        return true;
      }

      console.log("Online: Deleting category from Firestore...");
      const docRef = doc(db, CATEGORIES_COLLECTION, id);
      await deleteDoc(docRef);
      await offlineDb.delete(CATEGORIES_COLLECTION, id);
      return true;
    } catch (error) {
      console.error("Error deleting category from Firestore, falling back to local DB:", error);
      await offlineDb.delete(CATEGORIES_COLLECTION, id);
      await syncService.addToQueue({ type: 'DELETE_CATEGORY', collection: CATEGORIES_COLLECTION, id });
      return true;
    }
  }
};