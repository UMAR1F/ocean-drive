import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Select,
  Skeleton,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import { IconAlertCircle, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { salesService } from '../../services/salesService';
import { useAuth } from '../../context/AuthContext';

const parseSaleDate = (value) => {
  if (value?.toDate) return value.toDate();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatMoney = (value) => `₦${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Dashboard() {
  const { currentUser, user } = useAuth();
  const activeUser = currentUser || user;
  const [sales, setSales] = useState([]);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSales = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await salesService.getSalesHistory(activeUser);
      setSales(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Report error loading sales:', err);
      setError(err.message || 'Could not load sales data.');
      notifications.show({ title: 'Report unavailable', message: 'Could not load sales data.', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, [activeUser]);

  const periodSales = useMemo(() => {
    const now = new Date();
    return sales.filter((sale) => {
      const saleDate = parseSaleDate(sale.createdAt);
      if (!saleDate) return false;
      if (period === 'today') return saleDate.toDateString() === now.toDateString();
      if (period === 'week') return saleDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (period === 'month') return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
      return true;
    });
  }, [sales, period]);

  const completedSales = periodSales.filter((sale) => sale.status !== 'returned');
  const returnedSales = periodSales.filter((sale) => sale.status === 'returned');
  const netSales = completedSales.reduce((sum, sale) => sum + Number(sale.total || sale.totalAmount || 0), 0);
  const returnedAmount = returnedSales.reduce((sum, sale) => sum + Number(sale.total || sale.totalAmount || 0), 0);
  const averageSale = completedSales.length ? netSales / completedSales.length : 0;
  const salesWithCostData = completedSales.filter((sale) => (
    Array.isArray(sale.items) && sale.items.length > 0 && sale.items.every((item) => (
      item.costTotal !== null && item.costTotal !== undefined && Number.isFinite(Number(item.costTotal))
    ))
  ));
  const costedSalesRevenue = salesWithCostData.reduce((sum, sale) => sum + Number(sale.total || sale.totalAmount || 0), 0);
  const costOfGoodsSold = salesWithCostData.reduce((sum, sale) => (
    sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.costTotal || 0), 0)
  ), 0);
  const grossProfit = costedSalesRevenue - costOfGoodsSold;
  const costCoverage = `${salesWithCostData.length} of ${completedSales.length} completed sales`;

  const bestSellers = useMemo(() => {
    const products = new Map();
    completedSales.forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const key = item.productId || item.name || 'unknown';
        const product = products.get(key) || { name: item.name || 'Unknown product', quantity: 0, revenue: 0 };
        product.quantity += Number(item.quantity || 0);
        product.revenue += Number(item.total ?? Number(item.price || 0) * Number(item.quantity || 0));
        products.set(key, product);
      });
    });
    return [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [completedSales]);

  const latestSales = [...periodSales]
    .sort((a, b) => (parseSaleDate(b.createdAt)?.getTime() || 0) - (parseSaleDate(a.createdAt)?.getTime() || 0))
    .slice(0, 10);

  if (loading) {
    return (
      <Box p={{ base: 'xs', md: 'md' }} aria-label="Loading sales report">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end">
            <Stack gap="xs"><Skeleton height={26} width={180} /><Skeleton height={12} width={270} /></Stack>
            <Group><Skeleton height={36} width={140} /><Skeleton height={36} width={72} /></Group>
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 2, lg: 3 }}>
            {Array.from({ length: 6 }, (_, index) => (
              <Paper key={index} withBorder p="md">
                <Skeleton height={10} width="45%" mb="md" />
                <Skeleton height={26} width="68%" mb="sm" />
                <Skeleton height={10} width="78%" />
              </Paper>
            ))}
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            {[0, 1].map((panel) => (
              <Paper key={panel} withBorder p="md">
                <Skeleton height={18} width="36%" mb="lg" />
                <Stack gap="lg">
                  {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} height={12} width={`${82 - index * 7}%`} />)}
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>
      </Box>
    );
  }

  return (
    <Box p={{ base: 'xs', md: 'md' }}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end" wrap="wrap" className="no-print">
          <div>
            <Title order={2}>Sales Report</Title>
            <Text size="sm" c="dimmed">Sales, returns, and best sellers for the selected period.</Text>
          </div>
          <Group>
            <Select
              aria-label="Report period"
              value={period}
              onChange={(value) => setPeriod(value || 'month')}
              data={[
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'Last 7 days' },
                { value: 'month', label: 'This month' },
                { value: 'all', label: 'All time' }
              ]}
              w={150}
            />
            <Tooltip label="Refresh report">
              <ActionIcon variant="light" size="lg" onClick={loadSales} aria-label="Refresh report">
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>
              Print
            </Button>
          </Group>
        </Group>

        {error && <Alert icon={<IconAlertCircle size={16} />} title="Could not load report" color="red" variant="light">{error}</Alert>}
        {completedSales.length > salesWithCostData.length && (
          <Alert color="orange" title="Profit data is incomplete">
            Gross profit is available for {costCoverage}. Enter a buying price for each product before selling it. Older sales without saved cost data cannot be recalculated accurately.
          </Alert>
        )}

        <SimpleGrid cols={{ base: 2, sm: 2, lg: 3 }}>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Net sales</Text>
            <Text size="xl" fw={700} c="teal">{formatMoney(netSales)}</Text>
            <Text size="xs" c="dimmed">Excludes returned sales</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Completed sales</Text>
            <Text size="xl" fw={700}>{completedSales.length}</Text>
            <Text size="xs" c="dimmed">For this period</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Returns</Text>
            <Text size="xl" fw={700} c={returnedSales.length ? 'red' : undefined}>{formatMoney(returnedAmount)}</Text>
            <Text size="xs" c="dimmed">{returnedSales.length} returned sales</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Average sale</Text>
            <Text size="xl" fw={700}>{formatMoney(averageSale)}</Text>
            <Text size="xs" c="dimmed">Per completed sale</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Cost of goods sold</Text>
            <Text size="xl" fw={700}>{salesWithCostData.length ? formatMoney(costOfGoodsSold) : 'N/A'}</Text>
            <Text size="xs" c="dimmed">Based on saved sale-time costs for {costCoverage}</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Gross profit</Text>
            <Text size="xl" fw={700} c={grossProfit < 0 ? 'red' : 'teal'}>{salesWithCostData.length ? formatMoney(grossProfit) : 'N/A'}</Text>
            <Text size="xs" c="dimmed">Sales minus product costs; excludes expenses</Text>
          </Paper>
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Title order={4}>Best sellers</Title>
              <Text size="xs" c="dimmed">Top 5 by sales value</Text>
            </Group>
            {bestSellers.length === 0 ? <Text c="dimmed" py="md">No completed sales in this period.</Text> : (
              <Table.ScrollContainer minWidth={360}>
                <Table verticalSpacing="sm">
                  <Table.Thead><Table.Tr><Table.Th>Product</Table.Th><Table.Th>Qty</Table.Th><Table.Th ta="right">Sales</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {bestSellers.map((product, index) => (
                      <Table.Tr key={`${product.name}-${index}`}>
                        <Table.Td>{product.name}</Table.Td>
                        <Table.Td>{product.quantity}</Table.Td>
                        <Table.Td ta="right" fw={600}>{formatMoney(product.revenue)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>

          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Title order={4}>Latest sales</Title>
              <Text size="xs" c="dimmed">{latestSales.length} shown</Text>
            </Group>
            {latestSales.length === 0 ? <Text c="dimmed" py="md">No sales in this period.</Text> : (
              <Table.ScrollContainer minWidth={420}>
                <Table verticalSpacing="sm">
                  <Table.Thead><Table.Tr><Table.Th>Time</Table.Th><Table.Th>Status</Table.Th><Table.Th ta="right">Total</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {latestSales.map((sale) => (
                      <Table.Tr key={sale.id}>
                        <Table.Td>{parseSaleDate(sale.createdAt)?.toLocaleString() || 'Unknown date'}</Table.Td>
                        <Table.Td><Badge color={sale.status === 'returned' ? 'red' : 'teal'} variant="light">{sale.status === 'returned' ? 'Returned' : 'Completed'}</Badge></Table.Td>
                        <Table.Td ta="right" fw={600}>{formatMoney(sale.total || sale.totalAmount)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
        </SimpleGrid>
      </Stack>

      <style>{`@media print { .no-print { display: none !important; } .mantine-AppShell-main { padding: 0 !important; } }`}</style>
    </Box>
  );
}