import { db } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { offlineDb } from './offlineDb';
import { syncService } from './syncService';
import { auditService } from './auditService';

const COLLECTION_NAME = 'notifications';

export const notificationService = {
  async getNotices() {
    try {
      let rawNotices = [];

      if (!navigator.onLine) {
        console.log("Offline: Fetching notices from local DB");
        rawNotices = await offlineDb.getAll(COLLECTION_NAME);
      } else {
        console.log("Online: Fetching notices from Firestore...");
        const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        rawNotices = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          let formattedDate = new Date().toISOString();
          if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            formattedDate = data.createdAt.toDate().toISOString();
          } else if (data.createdAt) {
            formattedDate = String(data.createdAt);
          }
          return { id: docSnap.id, ...data, createdAt: formattedDate };
        });
      }

      // Sort descending by date
      rawNotices.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      // Cache down locally
      for (const notice of rawNotices) {
        await offlineDb.put(COLLECTION_NAME, notice);
      }

      return rawNotices;
    } catch (error) {
      console.warn("Firestore fetch failed, falling back to local DB:", error);
      const localNotices = await offlineDb.getAll(COLLECTION_NAME) || [];
      localNotices.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return localNotices;
    }
  },

  async sendNotice({ title, message, adminUser }) {
    const role = adminUser?.role || adminUser?.userRole;
    if (adminUser?.isAdmin !== true && role !== 'admin') {
      throw new Error('Only administrators can send announcements.');
    }

    const cleanMessage = typeof message === 'string' ? message.trim() : '';
    if (!cleanMessage) {
      throw new Error('Announcement message cannot be empty.');
    }

    const timestamp = new Date().toISOString();

    const noticeData = {
      title: typeof title === 'string' && title.trim() ? title.trim() : 'System Announcement',
      message: cleanMessage,
      senderName: adminUser?.displayName || adminUser?.name || adminUser?.email || 'Admin',
      senderId: adminUser?.uid || adminUser?.id || 'admin',
      createdAt: timestamp
    };

    try {
      if (!navigator.onLine) {
        console.log("Offline: Adding notice locally");
        const localId = await offlineDb.add(COLLECTION_NAME, noticeData);
        
        const localNoticeWithId = { id: localId, ...noticeData };
        await offlineDb.put(COLLECTION_NAME, localNoticeWithId);

        await syncService.addToQueue({ 
          type: 'SEND_NOTICE', 
          collection: COLLECTION_NAME, 
          data: noticeData, 
          localId 
        });

        try {
          await auditService.logAction({
            actionType: 'SEND_NOTICE_OFFLINE',
            entityId: localId,
            entityName: noticeData.title,
            details: `Broadcasted notice offline: "${noticeData.message.substring(0, 40)}..."`,
            user: adminUser
          });
        } catch (e) {}

        return { ...localNoticeWithId, queued: true };
      }

      console.log("Online: Saving notice to Firestore...");
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...noticeData,
        createdAt: serverTimestamp()
      });
      
      const savedNotice = { id: docRef.id, ...noticeData };
      
      await offlineDb.put(COLLECTION_NAME, savedNotice);

      try {
        await auditService.logAction({
          actionType: 'SEND_NOTICE',
          entityId: docRef.id,
          entityName: noticeData.title,
          details: `Broadcasted notice to staff: "${noticeData.message.substring(0, 40)}..."`,
          user: adminUser
        });
      } catch (e) {}

      return { ...savedNotice, queued: false };
    } catch (error) {
      const transientCodes = ['unavailable', 'deadline-exceeded', 'network-request-failed'];
      const isTransient = transientCodes.some(code => error?.code?.endsWith(code));
      if (navigator.onLine && !isTransient) {
        throw error;
      }

      console.error("Firestore write failed, falling back to local DB:", error);
      const localId = await offlineDb.add(COLLECTION_NAME, noticeData);
      
      const fallbackNotice = { id: localId, ...noticeData };
      await offlineDb.put(COLLECTION_NAME, fallbackNotice);

      await syncService.addToQueue({ 
        type: 'SEND_NOTICE', 
        collection: COLLECTION_NAME, 
        data: noticeData, 
        localId 
      });

      return { ...fallbackNotice, queued: true };
    }
  },

  async deleteNotice({ notice, adminUser }) {
    const role = adminUser?.role || adminUser?.userRole;
    if (adminUser?.isAdmin !== true && role !== 'admin') {
      throw new Error('Only administrators can delete announcements.');
    }
    if (!notice?.id) throw new Error('Notice not found.');

    if (!navigator.onLine || String(notice.id).startsWith('offline_')) {
      await offlineDb.delete(COLLECTION_NAME, notice.id);
      if (!String(notice.id).startsWith('offline_')) {
        await syncService.addToQueue({
          type: 'DELETE_NOTIFICATION',
          collection: COLLECTION_NAME,
          remoteId: notice.id
        });
      }
      await auditService.logAction({
        actionType: 'DELETE_NOTICE_OFFLINE',
        entityId: notice.id,
        entityName: notice.title || 'Announcement',
        details: 'Deleted a staff announcement offline.',
        user: adminUser
      });
      return { queued: !String(notice.id).startsWith('offline_') };
    }

    await deleteDoc(doc(db, COLLECTION_NAME, notice.id));
    await offlineDb.delete(COLLECTION_NAME, notice.id);
    await auditService.logAction({
      actionType: 'DELETE_NOTICE',
      entityId: notice.id,
      entityName: notice.title || 'Announcement',
      details: 'Deleted a staff announcement.',
      user: adminUser
    });
    return { queued: false };
  }
};