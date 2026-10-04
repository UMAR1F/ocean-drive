import { db } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { offlineDb } from './offlineDb';
import { syncService } from './syncService';
import { exportReportToExcel } from './excelExportService';

const COLLECTION_NAME = 'audit_logs';

export const auditService = {
  /**
   * Log any sensitive system or user action with offline-first support
   */
  async logAction({ actionType, entityId, entityName, details, user }) {
    const timestamp = new Date().toISOString();
    const auditRecord = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      actionType: actionType || 'UNKNOWN_ACTION',
      entityId: entityId || '',
      entityName: entityName || '',
      details: details || '',
      userId: user?.uid || user?.id || 'system',
      userName: user?.fullName || user?.name || user?.email || 'Staff/Admin',
      userRole: user?.role || user?.userRole || 'staff'
    };

    try {
      if (!navigator.onLine) {
        console.log("Offline: Saving audit log locally in IndexedDB and queueing");
        await offlineDb.add(COLLECTION_NAME, auditRecord);
        await syncService.addToQueue({ 
          type: 'ADD_AUDIT_LOG', 
          collection: COLLECTION_NAME, 
          data: auditRecord 
        });
        return auditRecord;
      }

      console.log("Online: Writing audit log to Firestore...");
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...auditRecord,
        createdAt: serverTimestamp()
      });
      
      const savedRecord = { id: docRef.id, ...auditRecord };
      await offlineDb.put(COLLECTION_NAME, savedRecord);
      return savedRecord;
    } catch (error) {
      console.warn("Audit logging failed online, falling back to local save:", error);
      await offlineDb.add(COLLECTION_NAME, auditRecord);
      await syncService.addToQueue({ 
        type: 'ADD_AUDIT_LOG', 
        collection: COLLECTION_NAME, 
        data: auditRecord 
      });
      return auditRecord;
    }
  },

  /**
   * Fetch all audit logs for the admin UI report view
   */
  async getAuditLogs() {
    try {
      if (!navigator.onLine) {
        console.log("Offline: Fetching audit logs from local DB");
        const logs = await offlineDb.getAll(COLLECTION_NAME);
        return Array.isArray(logs) ? logs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)) : [];
      }

      console.log("Online: Fetching audit logs from Firestore...");
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const logs = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
          data.createdAt = data.createdAt.toDate().toISOString();
        }
        return { id: docSnap.id, ...data };
      });

      logs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

      for (const log of logs) {
        await offlineDb.put(COLLECTION_NAME, log);
      }
      return logs;
    } catch (error) {
      console.warn("Firestore audit fetch failed, falling back to local DB:", error);
      const localLogs = await offlineDb.getAll(COLLECTION_NAME);
      return Array.isArray(localLogs) ? localLogs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)) : [];
    }
  },

  /**
   * Filter audit logs directly from the service layer based on criteria
   */
  async queryAuditLogs({ searchQuery = '', actionFilter = 'ALL', roleFilter = 'ALL', startDate = '', endDate = '' } = {}) {
    const logs = await this.getAuditLogs();

    return logs.filter(log => {
      const queryStr = searchQuery.toLowerCase();
      const matchesSearch = 
        !queryStr ||
        (log.entityName || '').toLowerCase().includes(queryStr) ||
        (log.details || '').toLowerCase().includes(queryStr) ||
        (log.userName || '').toLowerCase().includes(queryStr) ||
        (log.entityId || '').toLowerCase().includes(queryStr) ||
        (log.actionType || '').toLowerCase().includes(queryStr);

      const matchesAction = actionFilter === 'ALL' || (log.actionType || '').toUpperCase().includes(actionFilter.toUpperCase());
      const matchesRole = roleFilter === 'ALL' || (log.userRole || '').toLowerCase() === roleFilter.toLowerCase();

      const logDate = log.timestamp ? log.timestamp.split('T')[0] : '';
      const matchesStartDate = !startDate || logDate >= startDate;
      const matchesEndDate = !endDate || logDate <= endDate;

      return matchesSearch && matchesAction && matchesRole && matchesStartDate && matchesEndDate;
    });
  },

  /**
   * Export audit logs to Excel (.xlsx) with Mobile Share Support
   */
  async exportAuditsToExcel(auditLogsArray, fileName = `Quality_Audit_Report_${new Date().toISOString().split('T')[0]}.xlsx`) {
    if (!auditLogsArray || auditLogsArray.length === 0) {
      throw new Error("No audit records available to export.");
    }

    return exportReportToExcel({
      title: 'Audit Activity Report',
      subtitle: 'Filtered activity records, including actor, action, and affected item.',
      fileName,
      sheetName: 'Audit Activity',
      columns: [
        { header: 'Date and time', key: 'timestamp', width: 23 },
        { header: 'Activity', key: 'actionType', width: 24 },
        { header: 'Item or record', key: 'entityName', width: 28 },
        { header: 'Reference ID', key: 'entityId', width: 28 },
        { header: 'Details', key: 'details', width: 48 },
        { header: 'Performed by', key: 'userName', width: 24 },
        { header: 'Role', key: 'userRole', width: 14 }
      ],
      rows: auditLogsArray.map(log => ({
        timestamp: log.timestamp ? new Date(log.timestamp).toLocaleString() : '',
        actionType: log.actionType || 'UNKNOWN',
        entityName: log.entityName || 'System',
        entityId: log.entityId || '',
        details: log.details || '',
        userName: log.userName || 'Unknown user',
        userRole: log.userRole || 'staff'
      }))
    });
  }
};