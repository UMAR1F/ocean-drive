import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { offlineDb } from './offlineDb';
import { syncService } from './syncService';
import { auditService } from './auditService';

const COLLECTION_NAME = 'purchase_orders';
const MAX_RECEIPT_DATA_URL_LENGTH = 950000;

const getUserId = (user) => user?.uid || user?.id || '';
const getUserName = (user) => user?.fullName || user?.name || user?.email || 'Staff';
const requireProcurementRole = (user) => {
  if (!['admin', 'manager'].includes(user?.role)) {
    throw new Error('Only an administrator or manager can update purchase orders.');
  }
};

const getIsoDate = (value) => {
  if (value?.toDate) return value.toDate().toISOString();
  return value || new Date().toISOString();
};

const sortOrders = (orders) => orders.sort((a, b) => (
  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
));

const logProcurementAudit = async (actionType, order, user) => {
  try {
    await auditService.logAction({
      actionType,
      entityId: order.id,
      entityName: `PO-${String(order.id).slice(-8).toUpperCase()} / ${order.supplier}`,
      details: `Supplier: ${order.supplier}; lines: ${order.items.length}; value: ₦${Number(order.total || 0).toFixed(2)}.`,
      user
    });
  } catch (error) {
    console.warn('Procurement action completed, but its audit record could not be saved:', error);
  }
};

const validateLines = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Add at least one product to the purchase order.');
  }

  return items.map((item) => {
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost);
    if (!item.productId || !item.name || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Each line needs a product and a whole-number quantity greater than zero.');
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error(`Enter a valid unit cost for ${item.name}.`);
    }
    return {
      productId: String(item.productId),
      name: item.name,
      sku: item.sku || '',
      uom: item.uom || 'units',
      quantity,
      unitCost,
      lineTotal: quantity * unitCost
    };
  });
};

const prepareReceivedItems = (orderedItems, receivedItems) => {
  if (!Array.isArray(receivedItems) || receivedItems.length !== orderedItems.length) {
    throw new Error('Enter the delivered quantity and actual unit cost for every order line.');
  }
  const receiptItems = [];
  let actualTotal = 0;

  const orderItems = orderedItems.map((orderedItem, index) => {
    const receivedItem = receivedItems[index];
    if (String(receivedItem?.productId) !== String(orderedItem.productId)) {
      throw new Error(`Missing delivery details for ${orderedItem.name}.`);
    }
    const receivedQuantity = Number(receivedItem.quantity);
    const receivedUnitCost = Number(receivedItem.unitCost);
    if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0) {
      throw new Error(`Enter a whole-number delivered quantity for ${orderedItem.name}.`);
    }
    if (!Number.isFinite(receivedUnitCost) || receivedUnitCost < 0) {
      throw new Error(`Enter a valid delivered unit cost for ${orderedItem.name}.`);
    }
    const receivedLineTotal = receivedQuantity * receivedUnitCost;
    actualTotal += receivedLineTotal;
    receiptItems.push({ ...orderedItem, quantity: receivedQuantity, unitCost: receivedUnitCost, lineTotal: receivedLineTotal });
    return { ...orderedItem, receivedQuantity, receivedUnitCost, receivedLineTotal };
  });

  return { orderItems, receiptItems, actualTotal };
};

const saveOrderUpdate = async (order, allowedStatuses, updateData, user, actionType) => {
  requireProcurementRole(user);
  if (!order?.id) throw new Error('Purchase order not found.');
  const localOrders = await offlineDb.getAll(COLLECTION_NAME);
  const cachedOrder = localOrders.find((item) => item.id === order.id || item.remoteId === order.remoteId) || order;
  if (!allowedStatuses.includes(cachedOrder.status)) {
    throw new Error('This purchase order is no longer in the expected status. Refresh and try again.');
  }
  const updatedOrder = { ...cachedOrder, ...updateData };
  const remoteId = cachedOrder.remoteId || cachedOrder.id;

  if (!navigator.onLine || String(cachedOrder.id).startsWith('offline_')) {
    await offlineDb.put(COLLECTION_NAME, updatedOrder);
    await syncService.addToQueue({
      type: 'UPDATE_PURCHASE_ORDER',
      collection: COLLECTION_NAME,
      localId: `purchase_update_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      remoteId,
      orderLocalId: cachedOrder.id,
      data: { ...updateData, expectedStatus: cachedOrder.status }
    });
    await logProcurementAudit(`${actionType}_OFFLINE`, updatedOrder, user);
    return { ...updatedOrder, offline: true };
  }

  const orderRef = doc(db, COLLECTION_NAME, remoteId);
  await runTransaction(db, async (transaction) => {
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) throw new Error('Purchase order no longer exists.');
    if (!allowedStatuses.includes(orderDoc.data().status)) {
      throw new Error('This purchase order is no longer in the expected status.');
    }
    transaction.update(orderRef, updateData);
  });
  try {
    await offlineDb.put(COLLECTION_NAME, updatedOrder);
  } catch (cacheError) {
    console.warn('Purchase order updated, but local cache update failed:', cacheError);
  }
  await logProcurementAudit(actionType, updatedOrder, user);
  return updatedOrder;
};

const aggregateReceiptLines = (items) => {
  const requirements = new Map();
  for (const item of items) {
    const current = requirements.get(item.productId) || {
      name: item.name,
      quantity: 0,
      incomingCost: 0
    };
    current.quantity += Number(item.quantity);
    current.incomingCost += Number(item.quantity) * Number(item.unitCost);
    requirements.set(item.productId, current);
  }
  return requirements;
};

export const procurementService = {
  async getPurchaseOrders() {
    try {
      if (!navigator.onLine) {
        return sortOrders(await offlineDb.getAll(COLLECTION_NAME));
      }

      const snapshot = await getDocs(query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc')));
      const orders = snapshot.docs.map((orderDoc) => {
        const data = orderDoc.data();
        return {
          id: orderDoc.id,
          ...data,
          createdAt: getIsoDate(data.createdAt),
          expectedDate: data.expectedDate || '',
          receivedAt: data.receivedAt ? getIsoDate(data.receivedAt) : null
        };
      });

      for (const order of orders) {
        try {
          await offlineDb.put(COLLECTION_NAME, order);
        } catch (cacheError) {
          console.warn('Could not cache purchase order:', cacheError);
        }
      }
      return sortOrders(orders);
    } catch (error) {
      console.warn('Purchase-order fetch failed, using local cache:', error);
      return sortOrders(await offlineDb.getAll(COLLECTION_NAME));
    }
  },

  async createPurchaseOrder({ supplier, supplierContact, expectedDate, notes, items, user }) {
    const normalizedSupplier = String(supplier || '').trim();
    if (!normalizedSupplier) throw new Error('Enter a supplier name.');
    const normalizedItems = validateLines(items);
    const timestamp = new Date().toISOString();
    const remoteId = doc(collection(db, COLLECTION_NAME)).id;
    const orderData = {
      supplier: normalizedSupplier,
      supplierContact: String(supplierContact || '').trim(),
      expectedDate: expectedDate || '',
      notes: String(notes || '').trim(),
      items: normalizedItems,
      total: normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0),
      status: 'pending_approval',
      createdAt: timestamp,
      createdBy: user?.uid || user?.id || '',
      createdByName: user?.fullName || user?.name || user?.email || 'Staff'
    };

    if (!navigator.onLine) {
      const localId = await offlineDb.add(COLLECTION_NAME, { ...orderData, remoteId });
      const savedOrder = { id: localId, remoteId, ...orderData };
      await offlineDb.put(COLLECTION_NAME, savedOrder);
      await syncService.addToQueue({
        type: 'CREATE_PURCHASE_ORDER',
        collection: COLLECTION_NAME,
        localId,
        remoteId,
        data: orderData
      });
      await logProcurementAudit('PURCHASE_ORDER_CREATED_OFFLINE', savedOrder, user);
      return { ...savedOrder, offline: true };
    }

    await setDoc(doc(db, COLLECTION_NAME, remoteId), {
      ...orderData,
      createdAt: serverTimestamp()
    });
    const savedOrder = { id: remoteId, remoteId, ...orderData };
    try {
      await offlineDb.put(COLLECTION_NAME, savedOrder);
    } catch (cacheError) {
      console.warn('Purchase order created, but local cache update failed:', cacheError);
    }
    await logProcurementAudit('PURCHASE_ORDER_CREATED', savedOrder, user);
    return savedOrder;
  },

  async approvePurchaseOrder(order, user, approved) {
    if (user?.role !== 'admin') throw new Error('Only an administrator can approve or reject a purchase order.');
    const timestamp = new Date().toISOString();
    const status = approved ? 'approved' : 'rejected';
    const updateData = approved
      ? { status, approvedAt: timestamp, approvedBy: getUserId(user), approvedByName: getUserName(user) }
      : { status, rejectedAt: timestamp, rejectedBy: getUserId(user), rejectedByName: getUserName(user) };
    return saveOrderUpdate(order, ['pending_approval'], updateData, user, approved ? 'PURCHASE_ORDER_APPROVED' : 'PURCHASE_ORDER_REJECTED');
  },

  async recordPaymentReceipt(order, receiptDataUrl, fileName, user) {
    requireProcurementRole(user);
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(receiptDataUrl || '')) {
      throw new Error('Upload a valid payment receipt image.');
    }
    if (receiptDataUrl.length > MAX_RECEIPT_DATA_URL_LENGTH) {
      throw new Error('The compressed receipt image is too large. Choose a smaller image.');
    }
    return saveOrderUpdate(order, ['approved'], {
      status: 'ordered',
      paymentReceiptDataUrl: receiptDataUrl,
      paymentReceiptName: String(fileName || 'Payment receipt'),
      paymentRecordedAt: new Date().toISOString(),
      paymentRecordedBy: getUserId(user),
      paymentRecordedByName: getUserName(user)
    }, user, 'PURCHASE_ORDER_PAYMENT_RECORDED');
  },

  async receivePurchaseOrder(order, receivedItems, user) {
    if (!order?.id) throw new Error('Purchase order not found.');
    requireProcurementRole(user);
    if (order.status !== 'ordered') throw new Error('Only ordered purchase orders can be received.');
    const localOrders = await offlineDb.getAll(COLLECTION_NAME);
    const cachedOrder = localOrders.find((item) => item.id === order.id || item.remoteId === order.remoteId) || order;
    const remoteId = cachedOrder.remoteId || cachedOrder.id;
    const { orderItems, receiptItems, actualTotal } = prepareReceivedItems(validateLines(cachedOrder.items), receivedItems);

    if (!navigator.onLine || String(cachedOrder.id).startsWith('offline_')) {
      const requirements = aggregateReceiptLines(receiptItems);
      const localProducts = await offlineDb.getAll('products');
      const updates = [];

      for (const [productId, requirement] of requirements) {
        const product = localProducts.find((item) => String(item.id) === String(productId));
        if (!product) throw new Error(`Product ${requirement.name} is missing from the local inventory cache.`);
        const currentStock = Number(product.stock || 0);
        const nextStock = currentStock + requirement.quantity;
        const currentCost = Number(product.costPrice || 0);
        const nextCost = nextStock > 0
          ? (currentStock * currentCost + requirement.incomingCost) / nextStock
          : currentCost;
        updates.push({ productId, stock: nextStock, costPrice: nextCost });
      }

      for (const update of updates) {
        await offlineDb.update('products', update.productId, {
          stock: update.stock,
          costPrice: update.costPrice,
          updatedAt: new Date().toISOString()
        });
      }

      const receivedAt = new Date().toISOString();
      const receivedOrder = {
        ...cachedOrder,
        items: orderItems,
        actualTotal,
        status: 'received',
        receivedAt,
        receivedBy: user?.uid || user?.id || '',
        receivedByName: user?.fullName || user?.name || user?.email || 'Staff'
      };
      await offlineDb.put(COLLECTION_NAME, receivedOrder);
      await syncService.addToQueue({
        type: 'RECEIVE_PURCHASE_ORDER',
        collection: COLLECTION_NAME,
        localId: `purchase_receive_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        remoteId,
        orderLocalId: cachedOrder.id,
        data: {
          items: receiptItems,
          orderItems,
          actualTotal,
          receivedAt,
          receivedBy: receivedOrder.receivedBy,
          receivedByName: receivedOrder.receivedByName
        }
      });
      await logProcurementAudit('PURCHASE_ORDER_RECEIVED_OFFLINE', receivedOrder, user);
      return { ...receivedOrder, offline: true };
    }

    const orderRef = doc(db, COLLECTION_NAME, remoteId);
    let receivedData;
    let productUpdates = [];
    await runTransaction(db, async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) throw new Error('Purchase order no longer exists.');
      const remoteOrder = orderDoc.data();
      if (remoteOrder.status !== 'ordered') throw new Error('This purchase order is no longer awaiting receipt.');

      const prepared = prepareReceivedItems(validateLines(remoteOrder.items), receivedItems);
      const requirements = aggregateReceiptLines(prepared.receiptItems);
      const productDocs = [];
      for (const [productId, requirement] of requirements) {
        const productRef = doc(db, 'products', productId);
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) throw new Error(`Product ${requirement.name} no longer exists.`);
        const product = productDoc.data();
        const currentStock = Number(product.stock || 0);
        const nextStock = currentStock + requirement.quantity;
        const currentCost = Number(product.costPrice || 0);
        const nextCost = nextStock > 0
          ? (currentStock * currentCost + requirement.incomingCost) / nextStock
          : currentCost;
        productDocs.push({ productRef, stock: nextStock, costPrice: nextCost, productId });
      }

      const receivedAt = new Date().toISOString();
      receivedData = {
        status: 'received',
        items: prepared.orderItems,
        actualTotal: prepared.actualTotal,
        receivedAt,
        receivedBy: user?.uid || user?.id || '',
        receivedByName: user?.fullName || user?.name || user?.email || 'Staff'
      };
      for (const product of productDocs) {
        transaction.update(product.productRef, {
          stock: product.stock,
          costPrice: product.costPrice,
          updatedAt: serverTimestamp()
        });
      }
      transaction.update(orderRef, { ...receivedData, receivedAt: serverTimestamp() });
      productUpdates = productDocs;
    });

    const receivedOrder = { ...cachedOrder, ...receivedData, id: remoteId, remoteId };
    for (const product of productUpdates) {
      try {
        await offlineDb.update('products', product.productId, {
          stock: product.stock,
          costPrice: product.costPrice,
          updatedAt: new Date().toISOString()
        });
      } catch (cacheError) {
        console.warn('Purchase received, but product cache update failed:', cacheError);
      }
    }
    try {
      await offlineDb.put(COLLECTION_NAME, receivedOrder);
    } catch (cacheError) {
      console.warn('Purchase received, but order cache update failed:', cacheError);
    }
    await logProcurementAudit('PURCHASE_ORDER_RECEIVED', receivedOrder, user);
    return receivedOrder;
  },

  async cancelPurchaseOrder(order, user) {
    if (!order?.id) throw new Error('Purchase order not found.');
    if (order.status !== 'ordered') throw new Error('Only ordered purchase orders can be cancelled.');
    const localOrders = await offlineDb.getAll(COLLECTION_NAME);
    const cachedOrder = localOrders.find((item) => item.id === order.id || item.remoteId === order.remoteId) || order;
    const cancelledAt = new Date().toISOString();
    const cancelledData = {
      status: 'cancelled',
      cancelledAt,
      cancelledBy: user?.uid || user?.id || '',
      cancelledByName: user?.fullName || user?.name || user?.email || 'Staff'
    };

    if (!navigator.onLine || String(cachedOrder.id).startsWith('offline_')) {
      const cancelledOrder = { ...cachedOrder, ...cancelledData };
      await offlineDb.put(COLLECTION_NAME, cancelledOrder);
      await syncService.addToQueue({
        type: 'CANCEL_PURCHASE_ORDER',
        collection: COLLECTION_NAME,
        localId: `purchase_cancel_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        remoteId: cachedOrder.remoteId || cachedOrder.id,
        orderLocalId: cachedOrder.id,
        data: cancelledData
      });
      await logProcurementAudit('PURCHASE_ORDER_CANCELLED_OFFLINE', cancelledOrder, user);
      return { ...cancelledOrder, offline: true };
    }

    const orderRef = doc(db, COLLECTION_NAME, cachedOrder.remoteId || cachedOrder.id);
    await runTransaction(db, async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) throw new Error('Purchase order no longer exists.');
      if (orderDoc.data().status !== 'ordered') throw new Error('This purchase order is no longer awaiting receipt.');
      transaction.update(orderRef, cancelledData);
    });
    const cancelledOrder = { ...cachedOrder, ...cancelledData };
    try {
      await offlineDb.put(COLLECTION_NAME, cancelledOrder);
    } catch (cacheError) {
      console.warn('Purchase order cancelled, but local cache update failed:', cacheError);
    }
    await logProcurementAudit('PURCHASE_ORDER_CANCELLED', cancelledOrder, user);
    return cancelledOrder;
  }
};