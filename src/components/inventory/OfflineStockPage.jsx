import React, { useEffect, useState } from 'react';
import {
	Alert,
	Badge,
	Box,
	Button,
	Group,
	Loader,
	NumberInput,
	Paper,
	Select,
	Stack,
	Table,
	Text,
	TextInput,
	Title
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDeviceDesktop, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { productService } from '../../services/productService';
import { offlineStockService } from '../../services/offlineStockService';
import { syncService } from '../../services/syncService';
import { useAuth } from '../../context/AuthContext';

export default function OfflineStockPage() {
	const [device, setDevice] = useState(null);
	const [devices, setDevices] = useState([]);
	const [products, setProducts] = useState([]);
	const [allocations, setAllocations] = useState([]);
	const [deviceName, setDeviceName] = useState('');
	const [quantities, setQuantities] = useState({});
	const [loading, setLoading] = useState(true);
	const [savingDevice, setSavingDevice] = useState(false);
	const [workingProductId, setWorkingProductId] = useState(null);
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	const [selectedDeviceId, setSelectedDeviceId] = useState('');
	const { currentUser, user } = useAuth();
	const activeUser = currentUser || user;

	const loadData = async () => {
		try {
			const [loadedDevices, loadedProducts] = await Promise.all([
				offlineStockService.listDevices(),
				productService.getAllProducts()
			]);
			const currentDevice = await offlineStockService.getCurrentDevice();
			setDevices(loadedDevices);
			setProducts(loadedProducts);
			const targetDeviceId = selectedDeviceId || currentDevice?.id || loadedDevices[0]?.id || '';
			const targetDevice = loadedDevices.find((item) => item.id === targetDeviceId) || currentDevice;
			if (targetDeviceId) {
				const currentAllocations = await offlineStockService.getAllocationsForDevice(targetDeviceId);
				setAllocations(currentAllocations);
			}
			setSelectedDeviceId(targetDeviceId);
			setDevice(targetDevice);
			setDeviceName(currentDevice?.name || '');
		} catch (error) {
			notifications.show({ title: 'Could not load offline stock', message: error.message, color: 'red' });
		} finally {
			setLoading(false);
		}
	};

	const handleSelectDevice = async (deviceId) => {
		setSelectedDeviceId(deviceId || '');
		setDevice(devices.find((item) => item.id === deviceId) || null);
		setAllocations(await offlineStockService.getAllocationsForDevice(deviceId));
	};

	useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		loadData();
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, []);

	const handleRegister = async () => {
		setSavingDevice(true);
		try {
			await offlineStockService.registerCurrentDevice(deviceName);
			await loadData();
			notifications.show({ title: 'Terminal registered', message: 'This POS can now receive offline stock allocations.', color: 'teal' });
		} catch (error) {
			notifications.show({ title: 'Registration failed', message: error.message, color: 'red' });
		} finally {
			setSavingDevice(false);
		}
	};

	const handleAllocate = async (product) => {
		const units = Number(quantities[product.id]);
		setWorkingProductId(product.id);
		try {
			await offlineStockService.allocateToDevice(selectedDeviceId, product, units, activeUser);
			setQuantities((current) => ({ ...current, [product.id]: '' }));
			await loadData();
			notifications.show({ title: 'Stock allocated', message: `${units} ${product.uom || 'units'} reserved for this terminal.`, color: 'teal' });
		} catch (error) {
			notifications.show({ title: 'Allocation failed', message: error.message, color: 'red' });
		} finally {
			setWorkingProductId(null);
		}
	};

	const handleRelease = async (product) => {
		setWorkingProductId(product.id);
		try {
			await syncService.syncPendingQueue();
			const released = await offlineStockService.releaseDeviceAllocation(selectedDeviceId, product.id);
			await loadData();
			notifications.show({ title: 'Allocation released', message: `${released} unused units returned to available stock.`, color: 'teal' });
		} catch (error) {
			notifications.show({ title: 'Could not release allocation', message: error.message, color: 'red' });
		} finally {
			setWorkingProductId(null);
		}
	};

	const currentDeviceId = offlineStockService.getCurrentDeviceId();
	const allocationByProduct = new Map(allocations.map((allocation) => [
		String(allocation.productId), Number(allocation.remainingUnits || 0)
	]));
	const registered = Boolean(device) && device.active !== false;

	if (loading) {
		return <Group justify="center" py="xl"><Loader /></Group>;
	}

	return (
		<Stack gap="lg">
			<Group justify="space-between" align="flex-start">
				<Box>
					<Title order={2}>Offline Stock</Title>
					<Text c="dimmed" size="sm" mt={4}>Reserve stock for this POS before it goes offline.</Text>
				</Box>
				<Button variant="default" leftSection={<IconRefresh size={16} />} onClick={loadData} disabled={!isOnline}>
					Refresh
				</Button>
			</Group>

			{!isOnline && (
				<Alert color="orange" title="Offline">
					You can view cached allocations, but registration and allocation changes require an internet connection.
				</Alert>
			)}

			<Paper withBorder p="md" radius="sm">
				<Stack gap="sm">
					<Group justify="space-between">
						<Group gap="sm">
							<IconDeviceDesktop size={20} />
							<Text fw={600}>This terminal</Text>
						</Group>
						<Badge color={registered ? 'teal' : 'gray'} variant="light">{registered ? 'Registered' : 'Not registered'}</Badge>
					</Group>
					<Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>Device ID: {currentDeviceId}</Text>
					<Group align="flex-end">
						<TextInput
							label="Terminal name"
							placeholder="e.g. Front counter"
							value={deviceName}
							onChange={(event) => setDeviceName(event.currentTarget.value)}
							maxLength={60}
							style={{ flex: 1 }}
						/>
						<Button onClick={handleRegister} loading={savingDevice} disabled={!isOnline}>
							{registered ? 'Save terminal' : 'Register terminal'}
						</Button>
					</Group>
					<Text size="xs" c="dimmed">Allocate and release stock only while managing this physical terminal.</Text>
					<Select
						label="Allocate stock to terminal"
						placeholder="Choose a registered terminal"
						data={devices.map((registeredDevice) => ({ value: registeredDevice.id, label: `${registeredDevice.name || registeredDevice.id} (${registeredDevice.id.slice(0, 8)})` }))}
						value={selectedDeviceId || null}
						onChange={handleSelectDevice}
						searchable
						disabled={!devices.length || !isOnline}
					/>
					{device && device.id !== currentDeviceId && <Text size="xs" c="blue">Managing allocations for {device.name || device.id}.</Text>}
				</Stack>
			</Paper>

			<Paper withBorder p="md" radius="sm">
				<Stack gap="md">
					<Group justify="space-between">
						<Box>
							<Text fw={600}>Product allocations</Text>
							<Text size="sm" c="dimmed">Allocated units are reserved from other terminals and online sales.</Text>
						</Box>
						<Text size="sm" c="dimmed">{allocations.filter((allocation) => Number(allocation.remainingUnits) > 0).length} active</Text>
					</Group>
					{!registered ? (
						<Text size="sm" c="dimmed">Register this terminal to allocate stock.</Text>
					) : (
						<Box style={{ overflowX: 'auto' }}>
							<Table miw={760} verticalSpacing="sm">
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Product</Table.Th>
										<Table.Th>On hand</Table.Th>
										<Table.Th>Unallocated</Table.Th>
										<Table.Th>This terminal</Table.Th>
										<Table.Th>Allocate</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{products.filter((product) => product.isActive !== false).map((product) => {
										const reserved = Number(product.offlineReservedUnits || 0);
										const available = Math.max(0, Number(product.stock || 0) - reserved);
										const allocated = allocationByProduct.get(String(product.id)) || 0;
										const busy = workingProductId === product.id;
										return (
											<Table.Tr key={product.id}>
												<Table.Td>
													<Text fw={500}>{product.name}</Text>
													<Text size="xs" c="dimmed">{product.sku || product.uom || 'Product'}</Text>
												</Table.Td>
												<Table.Td>{Number(product.stock || 0)}</Table.Td>
												<Table.Td>{available}</Table.Td>
												<Table.Td>{allocated}</Table.Td>
												<Table.Td>
													<Group wrap="nowrap" gap="xs">
														<NumberInput
															aria-label={`Units to allocate for ${product.name}`}
															value={quantities[product.id] ?? ''}
															onChange={(value) => setQuantities((current) => ({ ...current, [product.id]: value }))}
															min={1}
															max={available}
															allowDecimal={false}
															w={100}
														/>
														<Button
															aria-label={`Allocate stock for ${product.name}`}
															leftSection={<IconPlus size={15} />}
															loading={busy}
															disabled={!isOnline || !available || !Number.isInteger(Number(quantities[product.id])) || Number(quantities[product.id]) < 1}
															onClick={() => handleAllocate(product)}
														>
															Add
														</Button>
														{allocated > 0 && (
															<Button
																aria-label={`Release unused allocation for ${product.name}`}
																variant="subtle"
																color="red"
																loading={busy}
																disabled={!isOnline}
																onClick={() => handleRelease(product)}
																title="Release unused allocation"
															>
																<IconTrash size={16} />
															</Button>
														)}
													</Group>
												</Table.Td>
											</Table.Tr>
										);
									})}
								</Table.Tbody>
							</Table>
						</Box>
					)}
				</Stack>
			</Paper>

			<Paper withBorder p="md" radius="sm">
				<Text fw={600} mb="sm">Registered terminals</Text>
				{devices.length === 0 ? (
					<Text size="sm" c="dimmed">No POS terminals have been registered yet.</Text>
				) : (
					<Stack gap="xs">
						{devices.map((registeredDevice) => (
							<Group key={registeredDevice.id} justify="space-between" wrap="nowrap">
								<Text size="sm" truncate>{registeredDevice.name || registeredDevice.id}</Text>
								<Badge variant="light" color={registeredDevice.id === currentDeviceId ? 'teal' : 'gray'}>
									{registeredDevice.id === currentDeviceId ? 'This terminal' : 'Registered'}
								</Badge>
							</Group>
						))}
					</Stack>
				)}
			</Paper>
		</Stack>
	);
}