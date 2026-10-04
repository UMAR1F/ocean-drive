import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Box,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconCalendar,
  IconCheck,
  IconEye,
  IconPackage,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTruckDelivery,
  IconX
} from '@tabler/icons-react';
import { procurementService } from '../../services/procurementService';
import { productService } from '../../services/productService';
import { useAuth } from '../../context/AuthContext';

const pageSize = 10;
const formatMoney = value => `₦${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = value => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};
const getPurchaseOrderNumber = order => `PO-${String(order.remoteId || order.id).slice(-6).toUpperCase()}`;
const makeEmptyLine = () => ({ productId: '', name: '', sku: '', uom: 'units', quantity: 1, unitCost: 0 });
const compressReceiptImage = file => new Promise((resolve, reject) => {
  if (!file?.type?.startsWith('image/')) {
    reject(new Error('Choose an image file for the payment receipt.'));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the selected image.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not decode the selected image.'));
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 900000 && quality > 0.4) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export default function ProcurementPage() {
  const { currentUser, user } = useAuth();
  const activeUser = currentUser || user;
  const isAdmin = activeUser?.role === 'admin';
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activePage, setActivePage] = useState(1);

  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [supplier, setSupplier] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([makeEmptyLine()]);
  const [saving, setSaving] = useState(false);

  const [actionOrder, setActionOrder] = useState(null);
  const [actionType, setActionType] = useState('receive');
  const [processingAction, setProcessingAction] = useState(false);
  const [receivedLines, setReceivedLines] = useState([]);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [detailsOrder, setDetailsOrder] = useState(null);

  const loadData = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setError('');
    }
    try {
      const [purchaseOrders, inventoryProducts] = await Promise.all([
        procurementService.getPurchaseOrders(),
        productService.getAllProducts()
      ]);
      setOrders(Array.isArray(purchaseOrders) ? purchaseOrders : []);
      setProducts(Array.isArray(inventoryProducts) ? inventoryProducts : []);
    } catch (err) {
      console.error('Failed to load procurement data:', err);
      setError(err.message || 'Could not load purchase orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const productOptions = products
    .filter(product => product.isActive !== false)
    .map(product => ({ value: String(product.id), label: `${product.name}${product.sku ? ` (${product.sku})` : ''}` }));

  const orderLinesTotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0);
  const orderedOrders = orders.filter(order => order.status === 'ordered');
  const approvalOrders = orders.filter(order => order.status === 'pending_approval');
  const pendingValue = orderedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const now = new Date();
  const receivedThisMonth = orders.filter(order => {
    if (order.status !== 'received') return false;
    const receivedDate = new Date(order.receivedAt || '');
    return !Number.isNaN(receivedDate.getTime()) && receivedDate.getMonth() === now.getMonth() && receivedDate.getFullYear() === now.getFullYear();
  });
  const receivedValue = receivedThisMonth.reduce((sum, order) => sum + Number(order.total || 0), 0);

  const filteredOrders = useMemo(() => orders.filter(order => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return getPurchaseOrderNumber(order).toLowerCase().includes(query) ||
      String(order.supplier || '').toLowerCase().includes(query) ||
      (order.items || []).some(item => String(item.name || '').toLowerCase().includes(query));
  }), [orders, search, statusFilter]);
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const pageOrders = filteredOrders.slice((activePage - 1) * pageSize, activePage * pageSize);

  const resetForm = () => {
    setSupplier('');
    setSupplierContact('');
    setExpectedDate('');
    setNotes('');
    setLines([makeEmptyLine()]);
  };

  const updateLine = (index, key, value) => {
    setLines(current => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, [key]: value } : line
    )));
  };

  const selectProduct = (index, productId) => {
    const product = products.find(item => String(item.id) === String(productId));
    setLines(current => current.map((line, lineIndex) => (
      lineIndex === index
        ? {
            ...line,
            productId: productId || '',
            name: product?.name || '',
            sku: product?.sku || '',
            uom: product?.uom || 'units',
            unitCost: Number(product?.costPrice || 0)
          }
        : line
    )));
  };

  const handleCreateOrder = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const order = await procurementService.createPurchaseOrder({
        supplier,
        supplierContact,
        expectedDate,
        notes,
        items: lines,
        user: activeUser
      });
      notifications.show({
        title: order.offline ? 'Purchase request saved offline' : 'Purchase request submitted',
        message: `${getPurchaseOrderNumber(order)} for ${supplier} is waiting for administrator approval${order.offline ? ' and will sync when online' : ''}.`,
        color: order.offline ? 'yellow' : 'teal'
      });
      closeCreate();
      resetForm();
      await loadData();
    } catch (err) {
      notifications.show({ title: 'Could not create order', message: err.message || 'Please check the order details.', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const openOrderAction = (order, type) => {
    setActionOrder(order);
    setActionType(type);
    if (type === 'receive') {
      setReceivedLines((order.items || []).map(item => ({
        productId: item.productId,
        name: item.name,
        uom: item.uom || 'units',
        orderedQuantity: item.quantity,
        quantity: item.quantity,
        unitCost: item.unitCost
      })));
    }
  };

  const handleConfirmAction = async () => {
    if (!actionOrder) return;
    setProcessingAction(true);
    try {
      let result;
      if (actionType === 'receive') {
        result = await procurementService.receivePurchaseOrder(actionOrder, receivedLines, activeUser);
      } else if (actionType === 'approve' || actionType === 'reject') {
        result = await procurementService.approvePurchaseOrder(actionOrder, activeUser, actionType === 'approve');
      } else {
        result = await procurementService.cancelPurchaseOrder(actionOrder, activeUser);
      }
      const actionLabel = { receive: 'received', approve: 'approved', reject: 'rejected', cancel: 'cancelled' }[actionType];
      notifications.show({
        title: result.offline ? 'Saved offline' : `Order ${actionLabel}`,
        message: result.offline
          ? `The ${getPurchaseOrderNumber(result)} update is queued and will sync when online.`
          : `${getPurchaseOrderNumber(result)} has been ${actionLabel}${actionType === 'receive' ? '; stock and product cost were updated from delivered quantities.' : '.'}`,
        color: result.offline ? 'yellow' : 'teal'
      });
      setActionOrder(null);
      await loadData();
    } catch (err) {
      notifications.show({ title: 'Order update failed', message: err.message || 'Please try again.', color: 'red' });
    } finally {
      setProcessingAction(false);
    }
  };

  const handlePaymentImage = async event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressReceiptImage(file);
      setPaymentReceipt({ name: file.name, dataUrl });
    } catch (err) {
      setPaymentReceipt(null);
      notifications.show({ title: 'Could not use receipt image', message: err.message, color: 'red' });
    }
  };

  const handleSavePayment = async () => {
    if (!paymentOrder || !paymentReceipt) return;
    setProcessingPayment(true);
    try {
      const result = await procurementService.recordPaymentReceipt(paymentOrder, paymentReceipt.dataUrl, paymentReceipt.name, activeUser);
      notifications.show({
        title: result.offline ? 'Payment receipt saved offline' : 'Payment receipt recorded',
        message: `${getPurchaseOrderNumber(result)} can now be received when goods arrive${result.offline ? '; the update will sync online' : ''}.`,
        color: result.offline ? 'yellow' : 'teal'
      });
      setPaymentOrder(null);
      setPaymentReceipt(null);
      await loadData();
    } catch (err) {
      notifications.show({ title: 'Could not record payment', message: err.message || 'Please try again.', color: 'red' });
    } finally {
      setProcessingPayment(false);
    }
  };

  const statusColor = status => ({ pending_approval: 'yellow', approved: 'teal', ordered: 'blue', received: 'green', rejected: 'red', cancelled: 'gray' }[status] || 'gray');
  const statusLabel = status => ({ pending_approval: 'Pending approval' }[status] || status || 'ordered');

  return (
    <Box p={{ base: 'xs', md: 'md' }}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <div>
            <Title order={2}>Procurement</Title>
            <Text size="sm" c="dimmed">Order stock from suppliers and record deliveries.</Text>
          </div>
          <Group>
            <Tooltip label="Refresh orders">
              <ActionIcon variant="light" size="lg" onClick={loadData} loading={loading} aria-label="Refresh orders">
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>New purchase order</Button>
          </Group>
        </Group>

        {error && <Alert icon={<IconAlertCircle size={16} />} title="Could not load procurement" color="red" variant="light">{error}</Alert>}

        <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Awaiting approval</Text>
            <Text size="xl" fw={700}>{approvalOrders.length}</Text>
            <Text size="sm" c="dimmed">Administrator review</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Awaiting delivery</Text>
            <Text size="xl" fw={700}>{orderedOrders.length}</Text>
            <Text size="sm" c="dimmed">{formatMoney(pendingValue)} committed</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Received this month</Text>
            <Text size="xl" fw={700}>{receivedThisMonth.length}</Text>
            <Text size="sm" c="dimmed">{formatMoney(receivedValue)} received value</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>All purchase requests</Text>
            <Text size="xl" fw={700}>{orders.length}</Text>
            <Text size="sm" c="dimmed">All workflow statuses</Text>
          </Paper>
        </SimpleGrid>

        <Paper withBorder p="md">
          <Group justify="space-between" mb="md" wrap="wrap">
            <Title order={4}>Purchase orders</Title>
            <Group>
              <TextInput
                placeholder="Search supplier, product, or PO..."
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={event => { setSearch(event.currentTarget.value); setActivePage(1); }}
                w={{ base: '100%', sm: 270 }}
              />
              <Select
                aria-label="Purchase order status"
                value={statusFilter}
                onChange={value => { setStatusFilter(value || 'all'); setActivePage(1); }}
                data={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'pending_approval', label: 'Pending approval' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'ordered', label: 'Ordered' },
                  { value: 'received', label: 'Received' },
                  { value: 'rejected', label: 'Rejected' },
                  { value: 'cancelled', label: 'Cancelled' }
                ]}
                w={150}
              />
            </Group>
          </Group>

          {loading ? <Group justify="center" py="xl"><Loader /></Group> : pageOrders.length === 0 ? (
            <Stack align="center" py="xl" gap="xs">
              <IconTruckDelivery size={32} color="var(--mantine-color-dimmed)" />
              <Text c="dimmed">{orders.length ? 'No purchase orders match these filters.' : 'No purchase orders yet.'}</Text>
              {orders.length === 0 && <Button variant="light" onClick={openCreate}>Create your first order</Button>}
            </Stack>
          ) : (
            <>
              <Table.ScrollContainer minWidth={760}>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>PO number</Table.Th>
                      <Table.Th>Supplier</Table.Th>
                      <Table.Th>Expected</Table.Th>
                      <Table.Th>Lines</Table.Th>
                      <Table.Th ta="right">Order value</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th ta="right">Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pageOrders.map(order => (
                      <Table.Tr key={order.id}>
                        <Table.Td>
                          <Button variant="subtle" size="compact-sm" px={0} onClick={() => setDetailsOrder(order)}>
                            {getPurchaseOrderNumber(order)}
                          </Button>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={500}>{order.supplier}</Text>
                          <Text size="xs" c="dimmed">{order.supplierContact || 'No contact'}</Text>
                        </Table.Td>
                        <Table.Td>{formatDate(order.expectedDate)}</Table.Td>
                        <Table.Td>{order.items?.length || 0}</Table.Td>
                        <Table.Td ta="right" fw={600}>{formatMoney(order.total)}</Table.Td>
                        <Table.Td><Badge color={statusColor(order.status)} variant="light">{statusLabel(order.status)}</Badge></Table.Td>
                        <Table.Td ta="right">
                          <Group justify="flex-end" gap="xs" wrap="nowrap">
                            <Tooltip label="View purchase order">
                              <ActionIcon variant="light" onClick={() => setDetailsOrder(order)} aria-label={`View ${getPurchaseOrderNumber(order)}`}>
                                <IconEye size={16} />
                              </ActionIcon>
                            </Tooltip>
                          {order.status === 'pending_approval' && isAdmin ? (
                            <Group justify="flex-end" gap="xs" wrap="nowrap">
                              <Tooltip label="Approve purchase request">
                                <ActionIcon color="teal" variant="light" onClick={() => openOrderAction(order, 'approve')} aria-label={`Approve ${getPurchaseOrderNumber(order)}`}>
                                  <IconCheck size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Reject purchase request">
                                <ActionIcon color="red" variant="subtle" onClick={() => openOrderAction(order, 'reject')} aria-label={`Reject ${getPurchaseOrderNumber(order)}`}>
                                  <IconX size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          ) : order.status === 'pending_approval' ? (
                            <Text size="xs" c="dimmed">Awaiting administrator</Text>
                          ) : order.status === 'approved' ? (
                            <Button size="xs" variant="light" onClick={() => { setPaymentOrder(order); setPaymentReceipt(null); }}>Add payment receipt</Button>
                          ) : order.status === 'ordered' ? (
                            <Group justify="flex-end" gap="xs" wrap="nowrap">
                              <Tooltip label="Record delivered quantities and update stock">
                                <ActionIcon color="teal" variant="light" onClick={() => openOrderAction(order, 'receive')} aria-label={`Receive ${getPurchaseOrderNumber(order)}`}>
                                  <IconCheck size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Cancel order">
                                <ActionIcon color="red" variant="subtle" onClick={() => openOrderAction(order, 'cancel')} aria-label={`Cancel ${getPurchaseOrderNumber(order)}`}>
                                  <IconX size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          ) : null}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {totalPages > 1 && (
                <Group justify="space-between" mt="md" wrap="wrap">
                  <Text size="sm" c="dimmed">Showing {(activePage - 1) * pageSize + 1}–{Math.min(activePage * pageSize, filteredOrders.length)} of {filteredOrders.length}</Text>
                  <Group gap="xs">
                    <Button variant="default" size="xs" disabled={activePage === 1} onClick={() => setActivePage(page => page - 1)}>Previous</Button>
                    <Text size="sm">{activePage} / {totalPages}</Text>
                    <Button variant="default" size="xs" disabled={activePage === totalPages} onClick={() => setActivePage(page => page + 1)}>Next</Button>
                  </Group>
                </Group>
              )}
            </>
          )}
        </Paper>
      </Stack>

      <Modal opened={createOpened} onClose={closeCreate} title="New purchase order" size="xl" centered>
        <form onSubmit={handleCreateOrder}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Supplier name" placeholder="Supplier or company" value={supplier} onChange={event => setSupplier(event.currentTarget.value)} required />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Supplier contact" placeholder="Phone or email (optional)" value={supplierContact} onChange={event => setSupplierContact(event.currentTarget.value)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput type="date" label="Expected delivery" leftSection={<IconCalendar size={16} />} value={expectedDate} onChange={event => setExpectedDate(event.currentTarget.value)} />
              </Grid.Col>
            </Grid>

            <div>
              <Group justify="space-between" mb="xs">
                <Text fw={600}>Products to order</Text>
                <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setLines(current => [...current, makeEmptyLine()])}>Add line</Button>
              </Group>
              <Stack gap="sm">
                {lines.map((line, index) => (
                  <Paper key={index} withBorder p="sm">
                    <Grid align="flex-end" gutter="sm">
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <Select
                          label="Product"
                          placeholder="Choose product"
                          data={productOptions}
                          value={line.productId || null}
                          onChange={value => selectProduct(index, value)}
                          searchable
                          nothingFoundMessage="No active products found"
                          required
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 5, sm: 2 }}>
                        <NumberInput label={`Qty (${line.uom})`} min={1} step={1} decimalScale={0} value={line.quantity} onChange={value => updateLine(index, 'quantity', value)} required />
                      </Grid.Col>
                      <Grid.Col span={{ base: 5, sm: 3 }}>
                        <NumberInput label="Unit cost" leftSection="₦" min={0} decimalScale={2} value={line.unitCost} onChange={value => updateLine(index, 'unitCost', value)} required />
                      </Grid.Col>
                      <Grid.Col span={{ base: 2, sm: 1 }}>
                        <ActionIcon color="red" variant="subtle" disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Remove order line">
                          <IconX size={16} />
                        </ActionIcon>
                      </Grid.Col>
                      <Grid.Col span={12}>
                        <Text size="xs" c="dimmed" ta="right">Line total: {formatMoney((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))}</Text>
                      </Grid.Col>
                    </Grid>
                  </Paper>
                ))}
              </Stack>
            </div>

            <Textarea label="Notes" placeholder="Optional delivery or order notes" value={notes} onChange={event => setNotes(event.currentTarget.value)} autosize minRows={2} maxRows={4} />
            <Alert icon={<IconPackage size={16} />} color="blue" variant="light">
              This submits a purchase request for administrator approval. Stock changes only after payment is recorded and the delivery is reconciled.
            </Alert>
            <Group justify="space-between" align="center">
              <Text fw={700}>Order total: {formatMoney(orderLinesTotal)}</Text>
              <Group>
                <Button variant="default" onClick={closeCreate}>Cancel</Button>
                <Button type="submit" loading={saving}>Submit for approval</Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(actionOrder)}
        onClose={() => !processingAction && setActionOrder(null)}
        title={{ receive: 'Record delivery', approve: 'Approve purchase request', reject: 'Reject purchase request', cancel: 'Cancel purchase order' }[actionType]}
        centered
      >
        {actionOrder && (
          <Stack gap="md">
            {actionType === 'receive' ? (
              <>
                <Text size="sm">Enter what was actually delivered. These quantities and costs, not the requested amounts, will be posted to stock.</Text>
                <Stack gap="sm">
                  {receivedLines.map((line, index) => (
                    <Paper key={line.productId} withBorder p="sm">
                      <Grid align="flex-end" gutter="sm">
                        <Grid.Col span={12}><Text fw={600} size="sm">{line.name}</Text><Text size="xs" c="dimmed">Ordered: {line.orderedQuantity} {line.uom}</Text></Grid.Col>
                        <Grid.Col span={{ base: 6, sm: 6 }}>
                          <NumberInput label={`Delivered (${line.uom})`} min={0} step={1} decimalScale={0} value={line.quantity} onChange={value => setReceivedLines(current => current.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: value } : item))} required />
                        </Grid.Col>
                        <Grid.Col span={{ base: 6, sm: 6 }}>
                          <NumberInput label="Actual unit cost" leftSection="₦" min={0} decimalScale={2} value={line.unitCost} onChange={value => setReceivedLines(current => current.map((item, lineIndex) => lineIndex === index ? { ...item, unitCost: value } : item))} required />
                        </Grid.Col>
                      </Grid>
                    </Paper>
                  ))}
                </Stack>
              </>
            ) : (
              <Text size="sm">
                {actionType === 'approve'
                  ? `Approve ${getPurchaseOrderNumber(actionOrder)} from ${actionOrder.supplier}? A manager must record the payment receipt before delivery can be received.`
                  : actionType === 'reject'
                    ? `Reject ${getPurchaseOrderNumber(actionOrder)} from ${actionOrder.supplier}?`
                    : `Cancel ${getPurchaseOrderNumber(actionOrder)} from ${actionOrder.supplier}? Inventory will not change.`}
              </Text>
            )}
            {actionType !== 'receive' && <Group justify="space-between"><Text fw={600}>{actionOrder.supplier}</Text><Text fw={700}>{formatMoney(actionOrder.total)}</Text></Group>}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setActionOrder(null)} disabled={processingAction}>Back</Button>
              <Button color={['receive', 'approve'].includes(actionType) ? 'teal' : 'red'} onClick={handleConfirmAction} loading={processingAction}>
                {{ receive: 'Post delivered stock', approve: 'Approve request', reject: 'Reject request', cancel: 'Confirm cancellation' }[actionType]}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal opened={Boolean(paymentOrder)} onClose={() => !processingPayment && setPaymentOrder(null)} title="Record payment receipt" centered>
        {paymentOrder && (
          <Stack gap="md">
            <Text size="sm">Upload the payment receipt for {getPurchaseOrderNumber(paymentOrder)}. The image is compressed and stored as base64 with this purchase order.</Text>
            <input type="file" accept="image/*" onChange={handlePaymentImage} aria-label="Payment receipt image" />
            {paymentReceipt && <Text size="sm" c="teal">Ready: {paymentReceipt.name}</Text>}
            <Group justify="space-between">
              <Text fw={600}>{paymentOrder.supplier}</Text>
              <Text fw={700}>{formatMoney(paymentOrder.total)}</Text>
            </Group>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setPaymentOrder(null)} disabled={processingPayment}>Cancel</Button>
              <Button onClick={handleSavePayment} loading={processingPayment} disabled={!paymentReceipt}>Save receipt</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal opened={Boolean(detailsOrder)} onClose={() => setDetailsOrder(null)} title={detailsOrder ? `Purchase order ${getPurchaseOrderNumber(detailsOrder)}` : 'Purchase order'} centered size="xl">
        {detailsOrder && (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              <div><Text size="xs" c="dimmed">SUPPLIER</Text><Text fw={600}>{detailsOrder.supplier}</Text></div>
              <div><Text size="xs" c="dimmed">CONTACT</Text><Text>{detailsOrder.supplierContact || '—'}</Text></div>
              <div><Text size="xs" c="dimmed">STATUS</Text><Badge color={statusColor(detailsOrder.status)}>{statusLabel(detailsOrder.status)}</Badge></div>
              <div><Text size="xs" c="dimmed">CREATED</Text><Text>{formatDate(detailsOrder.createdAt)}</Text></div>
              <div><Text size="xs" c="dimmed">EXPECTED DELIVERY</Text><Text>{formatDate(detailsOrder.expectedDate)}</Text></div>
              <div><Text size="xs" c="dimmed">REQUESTED BY</Text><Text>{detailsOrder.createdByName || '—'}</Text></div>
              {detailsOrder.approvedByName && <div><Text size="xs" c="dimmed">APPROVED BY</Text><Text>{detailsOrder.approvedByName}</Text></div>}
              {detailsOrder.paymentRecordedAt && <div><Text size="xs" c="dimmed">PAYMENT RECORDED</Text><Text>{formatDate(detailsOrder.paymentRecordedAt)}{detailsOrder.paymentRecordedByName ? ` by ${detailsOrder.paymentRecordedByName}` : ''}</Text></div>}
              {detailsOrder.receivedAt && <div><Text size="xs" c="dimmed">RECEIVED</Text><Text>{formatDate(detailsOrder.receivedAt)}{detailsOrder.receivedByName ? ` by ${detailsOrder.receivedByName}` : ''}</Text></div>}
            </SimpleGrid>
            <Table.ScrollContainer minWidth={420}>
              <Table>
                <Table.Thead><Table.Tr><Table.Th>Product</Table.Th><Table.Th>Requested</Table.Th><Table.Th>Delivered</Table.Th><Table.Th ta="right">Requested cost</Table.Th><Table.Th ta="right">Actual cost</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {(detailsOrder.items || []).map((item, index) => (
                    <Table.Tr key={`${item.productId}-${index}`}>
                      <Table.Td>{item.name}{item.sku && <Text size="xs" c="dimmed">{item.sku}</Text>}</Table.Td>
                      <Table.Td>{item.quantity} {item.uom}</Table.Td>
                      <Table.Td>{item.receivedQuantity === undefined ? '—' : `${item.receivedQuantity} ${item.uom}`}</Table.Td>
                      <Table.Td ta="right">{formatMoney(item.unitCost)}</Table.Td>
                      <Table.Td ta="right">{item.receivedUnitCost === undefined ? '—' : formatMoney(item.receivedUnitCost)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {detailsOrder.notes && <Text size="sm"><b>Notes:</b> {detailsOrder.notes}</Text>}
            {detailsOrder.paymentReceiptDataUrl && (
              <Paper withBorder p="sm">
                <Group justify="space-between" mb="sm">
                  <div>
                    <Text fw={600}>Payment receipt</Text>
                    <Text size="xs" c="dimmed">{detailsOrder.paymentReceiptName || 'Uploaded image'}</Text>
                  </div>
                  <Button component="a" href={detailsOrder.paymentReceiptDataUrl} target="_blank" rel="noreferrer" variant="light" size="xs">Open full size</Button>
                </Group>
                <a href={detailsOrder.paymentReceiptDataUrl} target="_blank" rel="noreferrer" aria-label="Open payment receipt image">
                  <img src={detailsOrder.paymentReceiptDataUrl} alt={`Payment receipt for ${getPurchaseOrderNumber(detailsOrder)}`} style={{ display: 'block', maxWidth: '100%', maxHeight: 360, objectFit: 'contain', marginInline: 'auto' }} />
                </a>
              </Paper>
            )}
            <Group justify="space-between">
              <Text fw={700}>{detailsOrder.status === 'received' ? 'Actual received total' : 'Order total'}</Text>
              <Text fw={700}>{formatMoney(detailsOrder.status === 'received' ? detailsOrder.actualTotal : detailsOrder.total)}</Text>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}