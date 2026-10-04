import React, { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip
} from '@mantine/core';
import { IconAlertCircle, IconAlertTriangle, IconCurrencyNaira, IconFileSpreadsheet, IconPackage, IconPlus, IconRefresh } from '@tabler/icons-react';
import { inventoryService } from '../../services/inventoryService';
import { exportReportToExcel } from '../../services/excelExportService';

const formatMoney = (value) => `₦${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function InventoryDashboardPage({ onNavigateToProducts, onNavigateToAdd }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const [fetchedProducts, fetchedCategories] = await Promise.all([
        inventoryService.getAllProducts(),
        inventoryService.getCategories()
      ]);
      setProducts(Array.isArray(fetchedProducts) ? fetchedProducts : []);
      setCategories(Array.isArray(fetchedCategories) ? fetchedCategories : []);
    } catch (err) {
      console.error('Error loading inventory overview:', err);
      setError(err.message || 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const activeProducts = products.filter(product => product.isActive !== false);
  const totalStockValue = products.reduce((sum, product) => (
    sum + Number(product.stock || 0) * Number(product.costPrice || 0)
  ), 0);
  const getThreshold = product => Number(product.minStockAlert ?? product.reorderPoint ?? 5);
  const outOfStockProducts = activeProducts.filter(product => Number(product.stock || 0) <= 0);
  const lowStockProducts = activeProducts
    .filter(product => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= getThreshold(product))
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
  const restockProducts = [...outOfStockProducts, ...lowStockProducts].slice(0, 10);

  const handleExport = async () => {
    if (!products.length) {
      setError('There are no products to export.');
      return;
    }

    setExporting(true);
    try {
      const categoryNames = new Map(categories.map(category => [String(category.id), category.name || 'Uncategorized']));
      const result = await exportReportToExcel({
        title: 'Inventory Stock Report',
        subtitle: 'Current stock, reorder points, valuation, and product status.',
        fileName: `Inventory_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'Inventory',
        columns: [
          { header: 'Product', key: 'name', width: 28 },
          { header: 'SKU', key: 'sku', width: 18 },
          { header: 'Barcode', key: 'barcode', width: 20 },
          { header: 'Category', key: 'category', width: 22 },
          { header: 'Status', key: 'status', width: 16 },
          { header: 'On hand', key: 'stock', width: 12, alignment: 'right', numFmt: '#,##0.##' },
          { header: 'Unit', key: 'unit', width: 12 },
          { header: 'Reorder at', key: 'threshold', width: 14, alignment: 'right', numFmt: '#,##0.##' },
          { header: 'Cost price', key: 'costPrice', width: 16, alignment: 'right', numFmt: '₦#,##0.00' },
          { header: 'Stock value', key: 'stockValue', width: 18, alignment: 'right', numFmt: '₦#,##0.00' },
          { header: 'Selling price', key: 'sellingPrice', width: 17, alignment: 'right', numFmt: '₦#,##0.00' },
          { header: 'Supplier', key: 'supplier', width: 24 },
          { header: 'Location', key: 'location', width: 20 }
        ],
        rows: products.map(product => {
          const stock = Number(product.stock || 0);
          const threshold = getThreshold(product);
          const inactive = product.isActive === false;
          return {
            name: product.name || '',
            sku: product.sku || '',
            barcode: product.barcode || '',
            category: categoryNames.get(String(product.categoryId)) || product.categoryName || 'Uncategorized',
            status: inactive ? 'Inactive' : stock <= 0 ? 'Out of stock' : stock <= threshold ? 'Low stock' : 'In stock',
            stock,
            unit: product.uom || 'units',
            threshold,
            costPrice: Number(product.costPrice || 0),
            stockValue: stock * Number(product.costPrice || 0),
            sellingPrice: Number(product.sellingPrice || product.price || 0),
            supplier: product.supplierName || '',
            location: product.location || ''
          };
        }),
        summary: [
          { label: 'Product records', value: products.length },
          { label: 'Active products', value: activeProducts.length },
          { label: 'Total stock at cost', value: totalStockValue, numFmt: '₦#,##0.00' },
          { label: 'Low stock products', value: lowStockProducts.length },
          { label: 'Out of stock products', value: outOfStockProducts.length }
        ]
      });
      if (!result.aborted) {
        setError('');
      }
    } catch (err) {
      setError(err.message || 'Could not create the inventory report.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <Group justify="center" py="xl"><Loader /><Text c="dimmed">Loading inventory...</Text></Group>;
  }

  return (
    <Stack gap="lg" p={{ base: 'xs', md: 'md' }}>
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={2}>Inventory</Title>
          <Text size="sm" c="dimmed">Stock value and items that need attention.</Text>
        </div>
        <Group>
          <Button leftSection={<IconFileSpreadsheet size={16} />} variant="light" onClick={handleExport} loading={exporting} disabled={!products.length}>
            Export Excel
          </Button>
          <Tooltip label="Refresh inventory">
            <ActionIcon variant="light" size="lg" onClick={loadProducts} aria-label="Refresh inventory">
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
          <Button variant="default" onClick={onNavigateToProducts}>All products</Button>
          <Button leftSection={<IconPlus size={16} />} onClick={onNavigateToAdd}>Add product</Button>
        </Group>
      </Group>

      {error && <Alert icon={<IconAlertCircle size={16} />} title="Could not load inventory" color="red" variant="light">{error}</Alert>}

      <SimpleGrid cols={{ base: 2, sm: 2, lg: 4 }}>
        <Paper withBorder p="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Active products</Text>
              <Text size="xl" fw={700}>{activeProducts.length}</Text>
              <Text size="xs" c="dimmed">{products.length} total records</Text>
            </div>
            <ThemeIcon color="blue" variant="light"><IconPackage size={20} /></ThemeIcon>
          </Group>
        </Paper>
        <Paper withBorder p="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Stock at cost</Text>
              <Text size="xl" fw={700}>{formatMoney(totalStockValue)}</Text>
              <Text size="xs" c="dimmed">Current stock × cost price</Text>
            </div>
            <ThemeIcon color="teal" variant="light"><IconCurrencyNaira size={20} /></ThemeIcon>
          </Group>
        </Paper>
        <Paper withBorder p="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Low stock</Text>
              <Text size="xl" fw={700} c={lowStockProducts.length ? 'orange' : undefined}>{lowStockProducts.length}</Text>
              <Text size="xs" c="dimmed">Above zero, at/below reorder point</Text>
            </div>
            <ThemeIcon color="orange" variant="light"><IconAlertTriangle size={20} /></ThemeIcon>
          </Group>
        </Paper>
        <Paper withBorder p="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Out of stock</Text>
              <Text size="xl" fw={700} c={outOfStockProducts.length ? 'red' : undefined}>{outOfStockProducts.length}</Text>
              <Text size="xs" c="dimmed">Active products with no stock</Text>
            </div>
            <ThemeIcon color="red" variant="light"><IconPackage size={20} /></ThemeIcon>
          </Group>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <div>
            <Title order={4}>Restock attention</Title>
            <Text size="xs" c="dimmed">Out-of-stock products first, then lowest stock.</Text>
          </div>
          <Badge variant="light">{outOfStockProducts.length + lowStockProducts.length} items</Badge>
        </Group>
        {restockProducts.length === 0 ? (
          <Text c="dimmed" py="md">All active products are above their reorder points.</Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Product</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>In stock</Table.Th>
                  <Table.Th>Reorder at</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {restockProducts.map(product => {
                  const stock = Number(product.stock || 0);
                  const outOfStock = stock <= 0;
                  return (
                    <Table.Tr key={product.id}>
                      <Table.Td fw={500}>{product.name}</Table.Td>
                      <Table.Td>{product.sku || '—'}</Table.Td>
                      <Table.Td>{stock} {product.uom || 'units'}</Table.Td>
                      <Table.Td>{getThreshold(product)}</Table.Td>
                      <Table.Td><Badge color={outOfStock ? 'red' : 'orange'} variant="light">{outOfStock ? 'Out of stock' : 'Low stock'}</Badge></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </Stack>
  );
}