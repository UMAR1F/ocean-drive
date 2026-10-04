import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	runTransaction,
	serverTimestamp,
	setDoc,
	where
} from 'firebase/firestore';
import { db } from '../firebase';
import { offlineDb } from './offlineDb';

const DEVICE_COLLECTION = 'posDevices';
const ALLOCATION_COLLECTION = 'offlineStockAllocations';
const DEVICE_ID_KEY = 'clientInventory.posDeviceId';
export const getOfflineAllocationId = (deviceId, productId) => `${deviceId}--${productId}`;

const makeDeviceId = () => (
	window.crypto?.randomUUID?.() || `pos_${Date.now()}_${Math.random().toString(36).slice(2)}`
);

export const offlineStockService = {
	getCurrentDeviceId() {
		let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
		if (!deviceId) {
			deviceId = makeDeviceId();
			window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
		}
		return deviceId;
	},

	async getCurrentDevice() {
		const deviceId = this.getCurrentDeviceId();
		const devices = await offlineDb.getAll(DEVICE_COLLECTION);
		return devices.find((device) => device.id === deviceId) || null;
	},

	async listDevices() {
		if (!navigator.onLine) return offlineDb.getAll(DEVICE_COLLECTION);

		const snapshot = await getDocs(collection(db, DEVICE_COLLECTION));
		const devices = snapshot.docs.map((deviceDoc) => ({ id: deviceDoc.id, ...deviceDoc.data() }));
		for (const device of devices) await offlineDb.put(DEVICE_COLLECTION, device);
		return devices.sort((left, right) => (left.name || '').localeCompare(right.name || ''));
	},

	async registerCurrentDevice(name) {
		if (!navigator.onLine) throw new Error('Connect to the internet to register this terminal.');
		const deviceId = this.getCurrentDeviceId();
		const device = {
			id: deviceId,
			name: String(name || '').trim() || `POS ${deviceId.slice(0, 6)}`,
			active: true,
			registeredAt: new Date().toISOString()
		};
		await setDoc(doc(db, DEVICE_COLLECTION, deviceId), {
			...device,
			registeredAt: serverTimestamp(),
			lastSeenAt: serverTimestamp()
		}, { merge: true });
		await offlineDb.put(DEVICE_COLLECTION, device);
		await this.refreshCurrentDevice();
		return device;
	},

	async refreshCurrentDevice() {
		if (!navigator.onLine) return this.getCurrentDevice();
		const deviceId = this.getCurrentDeviceId();
		const deviceRef = doc(db, DEVICE_COLLECTION, deviceId);
		const deviceSnapshot = await getDoc(deviceRef);
		if (!deviceSnapshot.exists()) return null;

		const device = { id: deviceId, ...deviceSnapshot.data() };
		await offlineDb.put(DEVICE_COLLECTION, device);
		const allocationQuery = query(
			collection(db, ALLOCATION_COLLECTION),
			where('deviceId', '==', deviceId)
		);
		const allocationSnapshot = await getDocs(allocationQuery);
		for (const allocationDoc of allocationSnapshot.docs) {
			await offlineDb.put(ALLOCATION_COLLECTION, {
				id: allocationDoc.id,
				...allocationDoc.data()
			});
		}
		return device;
	},

	async getCurrentAllocations() {
		const deviceId = this.getCurrentDeviceId();
		return this.getAllocationsForDevice(deviceId);
	},

	async getAllocationsForDevice(deviceId) {
		if (!deviceId) return [];
		if (!navigator.onLine) {
			const allocations = await offlineDb.getAll(ALLOCATION_COLLECTION);
			return allocations.filter((allocation) => allocation.deviceId === deviceId);
		}

		const allocationQuery = query(
			collection(db, ALLOCATION_COLLECTION),
			where('deviceId', '==', deviceId)
		);
		const allocationSnapshot = await getDocs(allocationQuery);
		const allocations = allocationSnapshot.docs.map((allocationDoc) => ({
			id: allocationDoc.id,
			...allocationDoc.data()
		}));
		for (const allocation of allocations) await offlineDb.put(ALLOCATION_COLLECTION, allocation);
		return allocations;
	},

	async allocateToDevice(deviceId, product, units, allocatedBy = null) {
		if (!navigator.onLine) throw new Error('Connect to the internet to allocate stock.');
		if (!Number.isInteger(units) || units <= 0) throw new Error('Enter a whole number greater than zero.');

		if (!deviceId) throw new Error('Choose a registered terminal.');
		const productId = String(product.id);
		const productRef = doc(db, 'products', productId);
		const deviceRef = doc(db, DEVICE_COLLECTION, deviceId);
		const allocationRef = doc(db, ALLOCATION_COLLECTION, getOfflineAllocationId(deviceId, productId));
		let updatedAllocation;
		let updatedProduct;

		await runTransaction(db, async (transaction) => {
			const [deviceSnapshot, productSnapshot, allocationSnapshot] = await Promise.all([
				transaction.get(deviceRef),
				transaction.get(productRef),
				transaction.get(allocationRef)
			]);
			if (!deviceSnapshot.exists() || deviceSnapshot.data().active === false) {
				throw new Error('Register this terminal before allocating stock.');
			}
			if (!productSnapshot.exists()) throw new Error('This product no longer exists.');

			const productData = productSnapshot.data();
			const currentStock = Number(productData.stock || 0);
			const reservedUnits = Number(productData.offlineReservedUnits || 0);
			const availableUnits = currentStock - reservedUnits;
			if (availableUnits < units) {
				throw new Error(`Only ${Math.max(0, availableUnits)} unallocated units are available.`);
			}

			const previous = allocationSnapshot.exists() ? allocationSnapshot.data() : {};
			const remainingUnits = Number(previous.remainingUnits || 0) + units;
			updatedAllocation = {
				id: allocationRef.id,
				deviceId,
				productId,
				productName: productData.name || product.name || '',
				remainingUnits,
				allocatedBy: allocatedBy?.uid || allocatedBy?.id || '',
				allocatedByName: allocatedBy?.displayName || allocatedBy?.fullName || allocatedBy?.email || '',
				allocatedAt: previous.allocatedAt || new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};
			updatedProduct = { ...productData, id: productId, offlineReservedUnits: reservedUnits + units };
			transaction.update(productRef, {
				offlineReservedUnits: reservedUnits + units,
				updatedAt: serverTimestamp()
			});
			transaction.set(allocationRef, {
				deviceId,
				productId,
				productName: updatedAllocation.productName,
				remainingUnits,
				allocatedBy: updatedAllocation.allocatedBy,
				allocatedByName: updatedAllocation.allocatedByName,
				allocatedAt: updatedAllocation.allocatedAt,
				updatedAt: serverTimestamp()
			});
		});

		await offlineDb.put(ALLOCATION_COLLECTION, updatedAllocation);
		await offlineDb.put('products', updatedProduct);
		return updatedAllocation;
	},

	async allocateToCurrentDevice(product, units, allocatedBy = null) {
		return this.allocateToDevice(this.getCurrentDeviceId(), product, units, allocatedBy);
	},

	async releaseDeviceAllocation(deviceId, productId) {
		if (!navigator.onLine) throw new Error('Connect to the internet before releasing stock.');
		const pendingQueue = await offlineDb.getAll('offlineQueue');
		if (pendingQueue.some((item) => item.type === 'COMPLETE_SALE' && item.deviceId === deviceId)) {
			throw new Error('Sync this terminal’s pending sales before releasing its allocation.');
		}

		const normalizedProductId = String(productId);
		const productRef = doc(db, 'products', normalizedProductId);
		const allocationRef = doc(db, ALLOCATION_COLLECTION, getOfflineAllocationId(deviceId, normalizedProductId));
		let remainingUnits = 0;
		let updatedProduct;
		await runTransaction(db, async (transaction) => {
			const [productSnapshot, allocationSnapshot] = await Promise.all([
				transaction.get(productRef),
				transaction.get(allocationRef)
			]);
			if (!productSnapshot.exists() || !allocationSnapshot.exists()) return;

			const productData = productSnapshot.data();
			remainingUnits = Number(allocationSnapshot.data().remainingUnits || 0);
			const reservedUnits = Math.max(0, Number(productData.offlineReservedUnits || 0) - remainingUnits);
			updatedProduct = { ...productData, id: normalizedProductId, offlineReservedUnits: reservedUnits };
			transaction.update(productRef, {
				offlineReservedUnits: reservedUnits,
				updatedAt: serverTimestamp()
			});
			transaction.update(allocationRef, {
				remainingUnits: 0,
				updatedAt: serverTimestamp()
			});
		});

		const cached = await offlineDb.getAll(ALLOCATION_COLLECTION);
		const existing = cached.find((allocation) => allocation.id === getOfflineAllocationId(deviceId, normalizedProductId));
		if (existing) await offlineDb.put(ALLOCATION_COLLECTION, { ...existing, remainingUnits: 0 });
		if (updatedProduct) await offlineDb.put('products', updatedProduct);
		return remainingUnits;
	},

	async releaseCurrentAllocation(productId) {
		return this.releaseDeviceAllocation(this.getCurrentDeviceId(), productId);
	}
};