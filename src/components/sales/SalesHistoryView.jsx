// src/components/sales/SalesHistoryView.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Card, Text, TextInput, Button, Group, Stack, 
  Table, Badge, Modal, Alert, Skeleton, ActionIcon, Tooltip, Select, Pagination, Divider, SimpleGrid, useMantineColorScheme 
} from '@mantine/core';
import { 
  IconHistory, 
  IconSearch, 
  IconReceiptRefund, 
  IconAlertCircle, 
  IconRefresh, 
  IconCheck, 
  IconX,
  IconEye,
  IconPrinter,
  IconFileSpreadsheet
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { salesService } from '../../services/salesService';
import { useAuth } from '../../context/AuthContext';
import ReceiptModal from './ReceiptModal'; // Import ReceiptModal for reprinting
import { exportReportToExcel } from '../../services/excelExportService';

export default function SalesHistoryView() {
  const { user, currentUser, userRole } = useAuth();
  const activeUser = currentUser || user;
  
  // Robust admin validation checking Firestore role, context role, and metadata flags
  const isAdmin = 
    activeUser?.role === 'admin' || 
    activeUser?.isAdmin || 
    activeUser?.userRole === 'admin' ||
    userRole === 'admin';

  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [dateFilter, setDateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [activePage, setActivePage] = useState(1);
  const pageSize = 10;

  // Details Modal State
  const [detailsModalOpened, { open: openDetailsModal, close: closeDetailsModal }] = useDisclosure(false);
  const [selectedSaleDetails, setSelectedSaleDetails] = useState(null);

  // Receipt Modal State for Reprinting
  const [receiptModalOpened, { open: openReceiptModal, close: closeReceiptModal }] = useDisclosure(false);
  const [saleForReceipt, setSaleForReceipt] = useState(null);

  // Refund Modal State
  const [refundModalOpened, { open: openRefundModal, close: closeRefundModal }] = useDisclosure(false);
  const [selectedSaleForRefund, setSelectedSaleForRefund] = useState(null);
  const [processingRefund, setProcessingRefund] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadSalesHistory();
  }, [activeUser]);

  // Reset pagination whenever the visible result set changes.
  useEffect(() => {
    setActivePage(1);
  }, [searchQuery, dateFilter, statusFilter]);

  const loadSalesHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await salesService.getSalesHistory(activeUser);
      setSales(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("SalesHistoryView: Failed to load sales history:", err);
      setError(err.message || 'Failed to fetch sales history');
      notifications.show({ title: 'Error', message: 'Failed to load sales history', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetails = (sale) => {
    setSelectedSaleDetails(sale);
    openDetailsModal();
  };

  const handleOpenReceiptModal = (e, sale) => {
    e.stopPropagation(); // Prevent row click bubbling
    setSaleForReceipt(sale);
    openReceiptModal();
  };

  const handleOpenRefundModal = (e, sale) => {
    e.stopPropagation(); // Prevent row click bubbling
    if (!isAdmin) {
      notifications.show({ title: 'Unauthorized', message: 'Only administrators can process returns or refunds.', color: 'orange' });
      return;
    }
    setSelectedSaleForRefund(sale);
    openRefundModal();
  };

  const handleConfirmReturn = async () => {
    if (!selectedSaleForRefund) return;
    setProcessingRefund(true);
    try {
      const result = await salesService.returnSale(selectedSaleForRefund.id, activeUser);
      notifications.show({
        title: 'Return Processed',
        message: result.offline
          ? 'Return saved locally and will sync when online. Process any payment refund separately.'
          : 'Sale marked returned and inventory restocked. Process any payment refund separately.',
        color: 'green'
      });
      closeRefundModal();
      loadSalesHistory();
    } catch (err) {
      notifications.show({
        title: 'Refund Failed',
        message: err.message || 'Could not process transaction return',
        color: 'red'
      });
    } finally {
      setProcessingRefund(false);
    }
  };

  // Filter and Search logic
  const filteredSales = useMemo(() => {
    const now = new Date();
    
    return sales.filter(s => {
      // Search matching
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query ||
        s.id?.toLowerCase().includes(query) ||
        s.cashierEmail?.toLowerCase().includes(query) ||
        s.cashierId?.toLowerCase().includes(query) ||
        s.paymentMethod?.toLowerCase().includes(query) ||
        s.items?.some(item => item.name?.toLowerCase().includes(query));

      if (!matchesSearch) return false;
      if (statusFilter !== 'all' && (s.status || 'completed') !== statusFilter) return false;

      // Date range filtering
      if (dateFilter === 'all') return true;

      const saleDate = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt || '');
      if (Number.isNaN(saleDate.getTime())) return false;
      
      if (dateFilter === 'day') {
        return saleDate.toDateString() === now.toDateString();
      }
      
      if (dateFilter === 'week') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return saleDate >= oneWeekAgo;
      }

      if (dateFilter === 'month') {
        return (
          saleDate.getMonth() === now.getMonth() &&
          saleDate.getFullYear() === now.getFullYear()
        );
      }

      return true;
    });
  }, [sales, searchQuery, dateFilter, statusFilter]);

  // Paginated slice
  const paginatedSales = useMemo(() => {
    const start = (activePage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, activePage]);

  const totalPages = Math.ceil(filteredSales.length / pageSize) || 1;

  const handleExport = async () => {
    if (!filteredSales.length) {
      notifications.show({ title: 'No sales to export', message: 'Adjust the search or filters and try again.', color: 'orange' });
      return;
    }

    setExporting(true);
    try {
      const completedTotal = filteredSales
        .filter(sale => sale.status !== 'returned')
        .reduce((sum, sale) => sum + Number(sale.total || sale.totalAmount || 0), 0);
      const returnedTotal = filteredSales
        .filter(sale => sale.status === 'returned')
        .reduce((sum, sale) => sum + Number(sale.total || sale.totalAmount || 0), 0);
      const result = await exportReportToExcel({
        title: 'Sales History Report',
        subtitle: 'All sales matching the current date, status, and search filters.',
        fileName: `Sales_History_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'Sales History',
        columns: [
          { header: 'Date and time', key: 'date', width: 23 },
          { header: 'Sale ID', key: 'id', width: 28 },
          { header: 'Cashier', key: 'cashier', width: 26 },
          { header: 'Payment', key: 'payment', width: 16 },
          { header: 'Items', key: 'items', width: 48 },
          { header: 'Subtotal', key: 'subtotal', width: 16, alignment: 'right', numFmt: '₦#,##0.00' },
          { header: 'Discount', key: 'discount', width: 14, alignment: 'right', numFmt: '₦#,##0.00' },
          { header: 'Total', key: 'total', width: 16, alignment: 'right', numFmt: '₦#,##0.00' },
          { header: 'Status', key: 'status', width: 16 },
          { header: 'Sync', key: 'sync', width: 16 }
        ],
        rows: filteredSales.map(sale => ({
          date: sale.createdAt?.toDate ? sale.createdAt.toDate().toLocaleString() : new Date(sale.createdAt || '').toLocaleString(),
          id: sale.id || '',
          cashier: sale.cashierEmail || sale.cashierId || 'Unknown',
          payment: sale.paymentMethod || 'cash',
          items: (sale.items || []).map(item => `${item.quantity} ${item.unitType || 'unit'} - ${item.name}`).join('; '),
          subtotal: Number(sale.subtotal || sale.total || sale.totalAmount || 0),
          discount: Number(sale.discount || 0),
          total: Number(sale.total || sale.totalAmount || 0),
          status: sale.status === 'returned' ? 'Returned' : 'Completed',
          sync: String(sale.id || '').startsWith('offline_') ? 'Pending sync' : 'Synced'
        })),
        summary: [
          { label: 'Completed sales total', value: completedTotal, numFmt: '₦#,##0.00' },
          { label: 'Returned sales value', value: returnedTotal, numFmt: '₦#,##0.00' }
        ]
      });
      if (!result.aborted) {
        notifications.show({ title: 'Export ready', message: result.method === 'shared' ? 'Sales report is ready to share.' : 'Sales report downloaded.', color: 'teal' });
      }
    } catch (err) {
      notifications.show({ title: 'Export failed', message: err.message || 'Could not create the sales report.', color: 'red' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box p={{ base: 'xs', md: 'md' }}>
      <Card withBorder shadow="sm" radius="md" p="md">
        <Group justify="space-between" mb="md" wrap="wrap">
          <div>
            <Group gap="xs">
              <IconHistory size={22} color="var(--mantine-color-blue-6)" />
              <Text fw={700} size="lg">Sales History</Text>
            </Group>
            <Text size="xs" c="dimmed">Search transactions, reprint receipts, or process an inventory return.</Text>
          </div>
          <Group gap="xs" wrap="wrap">
            <Select
              aria-label="Date range"
              value={dateFilter}
              onChange={(val) => setDateFilter(val || 'all')}
              data={[
                { value: 'all', label: 'All time' },
                { value: 'day', label: 'Today' },
                { value: 'week', label: 'Last 7 days' },
                { value: 'month', label: 'This month' }
              ]}
              w={140}
            />
            <Select
              aria-label="Sale status"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val || 'all')}
              data={[
                { value: 'all', label: 'All statuses' },
                { value: 'completed', label: 'Completed' },
                { value: 'returned', label: 'Returned' }
              ]}
              w={140}
            />
            <TextInput
              placeholder="Sale ID, cashier, or product..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              w={220}
            />
            <Tooltip label="Export matching sales to Excel">
              <Button leftSection={<IconFileSpreadsheet size={16} />} variant="light" onClick={handleExport} loading={exporting} disabled={!filteredSales.length}>
                Export
              </Button>
            </Tooltip>
            <Tooltip label="Refresh sales">
              <ActionIcon variant="light" size="lg" onClick={loadSalesHistory} loading={loading} aria-label="Refresh sales">
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Summary follows the current search and filters. */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} mb="lg">
          <Card withBorder p="sm" radius="md" style={{ backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : '#f8f9fa' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Net sales</Text>
            {loading ? <Skeleton height={28} width={112} mt={4} /> : <Text size="xl" fw={700} c="green" mt={4}>
              ₦{filteredSales
                .filter(s => s.status !== 'returned')
                .reduce((sum, s) => sum + Number(s.total || s.totalAmount || 0), 0)
                .toFixed(2)}
            </Text>}
          </Card>

          <Card withBorder p="sm" radius="md" style={{ backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : '#f8f9fa' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Transactions</Text>
            {loading ? <Skeleton height={28} width={64} mt={4} /> : <Text size="xl" fw={700} mt={4}>
              {filteredSales.filter(s => s.status !== 'returned').length}
            </Text>}
          </Card>

          <Card withBorder p="sm" radius="md" style={{ backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : '#f8f9fa' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Items sold</Text>
            {loading ? <Skeleton height={28} width={64} mt={4} /> : <Text size="xl" fw={700} mt={4}>
              {filteredSales
                .filter(s => s.status !== 'returned')
                .reduce((acc, s) => acc + (s.items?.reduce((iSum, item) => iSum + item.quantity, 0) || 0), 0)}
            </Text>}
          </Card>

          <Card withBorder p="sm" radius="md" style={{ backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : '#f8f9fa' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Returns Processed</Text>
            {loading ? <Skeleton height={28} width={64} mt={4} /> : <Text size="xl" fw={700} c="red" mt={4}>
              {filteredSales.filter(s => s.status === 'returned').length}
            </Text>}
          </Card>
        </SimpleGrid>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="md" variant="light">
            {error}
          </Alert>
        )}

        {loading ? (
          <Stack gap="md" aria-label="Loading sales history">
            {Array.from({ length: 7 }, (_, index) => (
              <Group key={index} wrap="nowrap" justify="space-between" py="xs" px="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                <Skeleton height={12} width="13%" />
                <Skeleton height={12} width="17%" />
                <Skeleton height={12} width="15%" />
                <Skeleton height={12} width="8%" />
                <Skeleton height={12} width="7%" />
                <Skeleton height={12} width="12%" />
                <Skeleton height={20} width={68} radius="xl" />
                <Skeleton height={26} width={58} />
              </Group>
            ))}
          </Stack>
        ) : filteredSales.length === 0 ? (
          <Box ta="center" py="xl">
            <Text c="dimmed">No sales transactions found for the selected filter.</Text>
          </Box>
        ) : (
          <>
            <Table.ScrollContainer minWidth={800}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Transaction ID</Table.Th>
                    <Table.Th>Date & Time</Table.Th>
                    <Table.Th>Cashier</Table.Th>
                    <Table.Th>Method</Table.Th>
                    <Table.Th>Items</Table.Th>
                    <Table.Th>Total Amount</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th align="right">Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {paginatedSales.map((sale) => {
                    const isReturned = sale.status === 'returned';
                    const saleDate = sale.createdAt?.toDate 
                      ? sale.createdAt.toDate().toLocaleString() 
                      : new Date(sale.createdAt || Date.now()).toLocaleString();

                    return (
                      <Table.Tr 
                        key={sale.id} 
                        onClick={() => handleOpenDetails(sale)} 
                        style={{ cursor: 'pointer' }}
                      >
                        <Table.Td>
                          <Text size="sm" fw={600} fontFamily="monospace">{sale.id.slice(0, 10)}...</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{saleDate}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{sale.cashierEmail || sale.cashierId || 'N/A'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="dot" tt="uppercase">{sale.paymentMethod || 'cash'}</Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{sale.items?.reduce((sum, i) => sum + i.quantity, 0) || 0} items</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={700}>₦{Number(sale.total || sale.totalAmount || 0).toFixed(2)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge 
                            color={isReturned ? 'red' : 'green'} 
                            variant="light"
                            leftSection={isReturned ? <IconX size={12} /> : <IconCheck size={12} />}
                          >
                            {isReturned ? 'Returned' : 'Completed'}
                          </Badge>
                        </Table.Td>
                        <Table.Td align="right">
                          <Group gap={4} justify="flex-end" onClick={(e) => e.stopPropagation()}>
                            <Tooltip label="View Full Details">
                              <ActionIcon 
                                color="blue" 
                                variant="subtle" 
                                onClick={() => handleOpenDetails(sale)}
                              >
                                <IconEye size={18} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Reprint Receipt">
                              <ActionIcon 
                                color="grape" 
                                variant="subtle" 
                                onClick={(e) => handleOpenReceiptModal(e, sale)}
                              >
                                <IconPrinter size={18} />
                              </ActionIcon>
                            </Tooltip>
                            {isAdmin && !isReturned && (
                              <Tooltip label="Process Return / Refund">
                                <ActionIcon 
                                  color="red" 
                                  variant="subtle" 
                                  onClick={(e) => handleOpenRefundModal(e, sale)}
                                >
                                  <IconReceiptRefund size={18} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {totalPages > 1 && (
              <Group justify="space-between" align="center" mt="md" wrap="wrap">
                <Text size="sm" c="dimmed">
                  Showing {((activePage - 1) * pageSize) + 1} to {Math.min(activePage * pageSize, filteredSales.length)} of {filteredSales.length} entries
                </Text>
                <Pagination total={totalPages} value={activePage} onChange={setActivePage} size="sm" />
              </Group>
            )}
          </>
        )}
      </Card>

      {/* Transaction Details Modal */}
      <Modal opened={detailsModalOpened} onClose={closeDetailsModal} title="Transaction Full Details" centered radius="md" size="lg">
        {selectedSaleDetails && (
          <Stack gap="md">
            <Box p="sm" style={{ backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : '#f8f9fa', borderRadius: '8px' }}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>Transaction Overview</Text>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>ID:</Text>
                <Text size="sm" fontFamily="monospace">{selectedSaleDetails.id}</Text>
              </Group>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>Date & Time:</Text>
                <Text size="sm">
                  {selectedSaleDetails.createdAt?.toDate 
                    ? selectedSaleDetails.createdAt.toDate().toLocaleString() 
                    : new Date(selectedSaleDetails.createdAt || Date.now()).toLocaleString()}
                </Text>
              </Group>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>Status:</Text>
                <Badge color={selectedSaleDetails.status === 'returned' ? 'red' : 'green'} size="sm">
                  {selectedSaleDetails.status === 'returned' ? 'Returned' : 'Completed'}
                </Badge>
              </Group>
            </Box>

            <Box p="sm" style={{ backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : '#f8f9fa', borderRadius: '8px' }}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>Cashier / User Details</Text>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>Cashier Email:</Text>
                <Text size="sm">{selectedSaleDetails.cashierEmail || 'N/A'}</Text>
              </Group>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>Cashier ID:</Text>
                <Text size="sm" fontFamily="monospace">{selectedSaleDetails.cashierId || 'N/A'}</Text>
              </Group>
            </Box>

            <Box>
              <Text size="sm" fw={700} mb="xs">Purchased Items Breakdown:</Text>
              <Table withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Item Name</Table.Th>
                    <Table.Th>Qty</Table.Th>
                    <Table.Th>Price</Table.Th>
                    <Table.Th>Total</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {selectedSaleDetails.items?.map((item, idx) => (
                    <Table.Tr key={idx}>
                      <Table.Td><Text size="sm">{item.name}</Text></Table.Td>
                      <Table.Td><Text size="sm">{item.quantity}</Text></Table.Td>
                      <Table.Td><Text size="sm">₦{Number(item.price || 0).toFixed(2)}</Text></Table.Td>
                      <Table.Td><Text size="sm" fw={600}>₦{Number((item.price || 0) * (item.quantity || 0)).toFixed(2)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>

            <Divider my="xs" />

            <Group justify="space-between">
              <Text size="sm" fw={600}>Payment Method:</Text>
              <Badge tt="uppercase" variant="light">{selectedSaleDetails.paymentMethod || 'cash'}</Badge>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={600}>Subtotal:</Text>
              <Text size="sm">₦{Number(selectedSaleDetails.subtotal || selectedSaleDetails.total || 0).toFixed(2)}</Text>
            </Group>
            {selectedSaleDetails.paymentMethod === 'cash' && (
              <>
                <Group justify="space-between">
                  <Text size="sm" fw={600}>Cash Received:</Text>
                  <Text size="sm">₦{Number(selectedSaleDetails.cashReceived || 0).toFixed(2)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" fw={600}>Change Given:</Text>
                  <Text size="sm">₦{Number(selectedSaleDetails.change || 0).toFixed(2)}</Text>
                </Group>
              </>
            )}
            <Group justify="space-between">
              <Text size="md" fw={700}>Final Total:</Text>
              <Text size="md" fw={700} c="green">₦{Number(selectedSaleDetails.total || selectedSaleDetails.totalAmount || 0).toFixed(2)}</Text>
            </Group>

            <Group justify="space-between" mt="md">
              <Button 
                variant="light" 
                color="grape" 
                leftSection={<IconPrinter size={16} />}
                onClick={() => {
                  closeDetailsModal();
                  setSaleForReceipt(selectedSaleDetails);
                  openReceiptModal();
                }}
              >
                Reprint Receipt
              </Button>
              <Button variant="default" onClick={closeDetailsModal}>Close</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Receipt Modal for Printing */}
      <ReceiptModal 
        opened={receiptModalOpened} 
        onClose={closeReceiptModal} 
        saleData={saleForReceipt} 
      />

      {/* Return Confirmation Modal */}
      <Modal opened={refundModalOpened} onClose={closeRefundModal} title="Confirm Transaction Return & Restock" centered radius="md">
        {selectedSaleForRefund && (
          <Stack gap="md">
            <Alert icon={<IconAlertCircle size={16} />} title="Important Notice" color="orange" variant="light">
              Processing a return will mark transaction <Text span fw={700} fontFamily="monospace">{selectedSaleForRefund.id}</Text> as returned and automatically add all purchased quantities back into active inventory stock levels.
            </Alert>

            <Box>
              <Text size="sm" fw={600} mb="xs">Items to be Restocked:</Text>
              <Stack gap={4}>
                {selectedSaleForRefund.items?.map((item, idx) => (
                  <Group key={idx} justify="space-between" p="xs" style={{ backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : '#f8f9fa', borderRadius: '4px' }}>
                    <Text size="sm">{item.name} ({item.unitType || 'piece'})</Text>
                    <Badge size="sm" variant="outline">+{item.unitsDeducted || item.quantity} units</Badge>
                  </Group>
                ))}
              </Stack>
            </Box>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeRefundModal}>Cancel</Button>
              <Button color="red" loading={processingRefund} onClick={handleConfirmReturn}>
                Confirm Return & Restock
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}