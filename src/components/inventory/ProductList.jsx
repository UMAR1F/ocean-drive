import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconPackage, IconPlus, IconRefresh, IconSearch, IconTrash } from '@tabler/icons-react';
import { productService } from '../../services/productService';
import { categoryService } from '../../services/categoryService';
import ProductModal from './ProductModal';
import CategoryModal from './CategoryModal';
import StockAdjustmentModal from './StockAdjustmentModal';

const getStockState = (product) => {
  const stock = Number(product.stock || 0);
  const threshold = Number(product.minStockAlert ?? product.reorderPoint ?? 5);
  if (stock <= 0) return { value: 'out', label: 'Out of stock', color: 'red' };
  if (stock <= threshold) return { value: 'low', label: 'Low stock', color: 'orange' };
  return { value: 'healthy', label: 'In stock', color: 'teal' };
};

const formatMoney = value => `₦${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatStockUpdate = value => value ? new Date(value).toLocaleDateString() : 'Not recorded';

export default function ProductList({ initialOpenAdd = false }) {
  const [activeSubTab, setActiveSubTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [productModalOpened, setProductModalOpened] = useState(initialOpenAdd);
  const [categoryModalOpened, setCategoryModalOpened] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const isMobile = useMediaQuery('(max-width: 48em)');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [productData, categoryData] = await Promise.all([
        productService.getAllProducts(),
        categoryService.getCategories()
      ]);
      setProducts(Array.isArray(productData) ? productData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
    } catch (err) {
      console.error('Failed to load product catalog:', err);
      setError(err.message || 'Could not load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const categoryNames = useMemo(() => new Map(categories.map(category => [String(category.id), category.name])), [categories]);
  const filteredProducts = products.filter(product => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || [product.name, product.sku, product.barcode]
      .some(value => String(value || '').toLowerCase().includes(query));
    const matchesCategory = categoryFilter === 'all' || String(product.categoryId || '') === categoryFilter;
    const matchesActive = activeFilter === 'all' || (activeFilter === 'active' ? product.isActive !== false : product.isActive === false);
    const matchesStock = stockFilter === 'all' || getStockState(product).value === stockFilter;
    return matchesSearch && matchesCategory && matchesActive && matchesStock;
  });

  const activeCount = products.filter(product => product.isActive !== false).length;
  const lowCount = products.filter(product => product.isActive !== false && getStockState(product).value === 'low').length;
  const outCount = products.filter(product => product.isActive !== false && getStockState(product).value === 'out').length;

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    setDeletingProductId(product.id);
    try {
      await productService.deleteProduct(product.id);
      notifications.show({ title: 'Product deleted', message: `${product.name} was removed.`, color: 'teal' });
      await loadData();
    } catch (err) {
      notifications.show({ title: 'Could not delete product', message: err.message || 'Please try again.', color: 'red' });
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleAddStock = async ({ quantity, costPrice, adjustmentDate }) => {
    if (!stockProduct || !Number.isInteger(quantity) || quantity < 1) return;
    setStockLoading(true);
    try {
      const product = stockProduct;
      const result = await productService.adjustStock(product.id, quantity, { costPrice, adjustmentDate });
      setStockProduct(null);
      await loadData();
      notifications.show({
        title: result?.queued ? 'Stock queued' : 'Stock updated',
        message: `${quantity} ${product.uom || 'units'} added to ${product.name} at ₦${Number(costPrice).toFixed(2)}${result?.queued ? '; it will sync when online.' : '.'}`,
        color: 'teal'
      });
    } catch (err) {
      notifications.show({ title: 'Stock update failed', message: err.message || 'Please try again.', color: 'red' });
    } finally {
      setStockLoading(false);
    }
  };

  const openAddProduct = () => {
    setSelectedProduct(null);
    setProductModalOpened(true);
  };

  const renderActions = (product) => (
    <Group gap={4} justify={isMobile ? 'flex-end' : 'center'} wrap="nowrap">
      <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setStockProduct(product)}>Add stock</Button>
      <Tooltip label="Edit product">
        <ActionIcon variant="light" color="blue" aria-label={`Edit ${product.name}`} onClick={() => { setSelectedProduct(product); setProductModalOpened(true); }}>
          <IconEdit size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Delete product">
        <ActionIcon variant="light" color="red" aria-label={`Delete ${product.name}`} loading={deletingProductId === product.id} onClick={() => handleDeleteProduct(product)}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );

  const renderProductCard = (product) => {
    const stock = getStockState(product);
    return (
      <Card key={product.id} withBorder p="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={3} style={{ minWidth: 0 }}>
            <Text fw={600} lineClamp={2}>{product.name}</Text>
            <Text size="xs" c="dimmed">{product.sku || 'No SKU'}{product.barcode ? ` · ${product.barcode}` : ''}</Text>
          </Stack>
          <Badge color={product.isActive === false ? 'gray' : stock.color} variant="light">
            {product.isActive === false ? 'Inactive' : stock.label}
          </Badge>
        </Group>
        <Group justify="space-between" mt="sm">
          <Text size="sm" c="dimmed">Stock</Text>
          <Text size="sm" fw={600}>{Number(product.stock || 0)} {product.uom || 'units'}</Text>
        </Group>
        <Group justify="space-between" mt={4}>
          <Text size="sm" c="dimmed">Retail price</Text>
          <Text size="sm" fw={600}>{formatMoney(product.sellingPrice ?? product.price)}</Text>
        </Group>
        <Group justify="space-between" mt={4}>
          <Text size="sm" c="dimmed">Category</Text>
          <Text size="sm">{categoryNames.get(String(product.categoryId)) || product.categoryName || 'Uncategorized'}</Text>
        </Group>
        <Group justify="flex-end" mt="sm">{renderActions(product)}</Group>
      </Card>
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={2}>Products</Title>
          <Text size="sm" c="dimmed">Search the catalog, check stock, and update product details.</Text>
        </div>
        <Group>
          <Tooltip label="Refresh products">
            <ActionIcon variant="light" size="lg" onClick={loadData} loading={loading} aria-label="Refresh products"><IconRefresh size={18} /></ActionIcon>
          </Tooltip>
          <Button leftSection={<IconPlus size={16} />} onClick={openAddProduct}>Add product</Button>
        </Group>
      </Group>

      {error && <Paper withBorder p="sm"><Group justify="space-between"><Text size="sm" c="red">{error}</Text><Button size="xs" variant="light" onClick={loadData}>Retry</Button></Group></Paper>}

      <Group gap="xs" wrap="wrap">
        <Badge variant="light" color="blue">{activeCount} active</Badge>
        <Badge variant="light" color="orange">{lowCount} low stock</Badge>
        <Badge variant="light" color="red">{outCount} out of stock</Badge>
      </Group>

      <Tabs value={activeSubTab} onChange={value => setActiveSubTab(value || 'products')}>
        <Tabs.List>
          <Tabs.Tab value="products" leftSection={<IconPackage size={16} />}>Products ({products.length})</Tabs.Tab>
          <Tabs.Tab value="categories">Categories ({categories.length})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="products" pt="md">
          <Stack gap="md">
            <Group grow align="flex-end" wrap="wrap">
              <TextInput
                placeholder="Search name, SKU, or barcode"
                aria-label="Search products"
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={event => setSearchQuery(event.currentTarget.value)}
                miw={220}
              />
              <Select
                label="Category"
                data={[{ value: 'all', label: 'All categories' }, ...categories.map(category => ({ value: String(category.id), label: category.name }))]}
                value={categoryFilter}
                onChange={value => setCategoryFilter(value || 'all')}
                searchable
                miw={160}
              />
              <Select label="Status" data={[{ value: 'all', label: 'All products' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} value={activeFilter} onChange={value => setActiveFilter(value || 'all')} miw={140} />
              <Select label="Stock" data={[{ value: 'all', label: 'Any stock level' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} value={stockFilter} onChange={value => setStockFilter(value || 'all')} miw={150} />
            </Group>
            <Text size="xs" c="dimmed">Showing {filteredProducts.length} of {products.length} products</Text>

            {loading ? (
              isMobile ? (
                <Stack gap="sm" aria-label="Loading products">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Paper key={index} withBorder p="sm">
                      <Group justify="space-between" mb="md">
                        <Stack gap="xs" style={{ flex: 1 }}>
                          <Skeleton height={14} width="55%" />
                          <Skeleton height={10} width="35%" />
                        </Stack>
                        <Skeleton height={22} width={86} radius="xl" />
                      </Group>
                      <Skeleton height={10} mb="sm" />
                      <Skeleton height={10} width="72%" mb="sm" />
                      <Group justify="flex-end" mt="md"><Skeleton height={28} width={84} /><Skeleton height={28} width={84} /></Group>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Paper withBorder p="md" aria-label="Loading products">
                  <Stack gap="lg">
                    {Array.from({ length: 6 }, (_, index) => (
                      <Group key={index} wrap="nowrap" justify="space-between">
                        <Skeleton height={12} width="24%" />
                        <Skeleton height={12} width="15%" />
                        <Skeleton height={12} width="12%" />
                        <Skeleton height={12} width="9%" />
                        <Skeleton height={20} width={70} radius="xl" />
                        <Skeleton height={28} width={100} />
                      </Group>
                    ))}
                  </Stack>
                </Paper>
              )
            ) : filteredProducts.length === 0 ? (
              <Paper withBorder p="xl" ta="center">
                <Text fw={500}>{products.length ? 'No products match these filters.' : 'Your catalog is empty.'}</Text>
                <Text size="sm" c="dimmed" mt={4}>{products.length ? 'Try a different search or filter.' : 'Add your first product to get started.'}</Text>
                {!products.length && <Button mt="md" leftSection={<IconPlus size={16} />} onClick={openAddProduct}>Add product</Button>}
              </Paper>
            ) : isMobile ? (
              <Stack gap="sm">{filteredProducts.map(renderProductCard)}</Stack>
            ) : (
              <Paper withBorder>
                <Table.ScrollContainer minWidth={900}>
                  <Table highlightOnHover verticalSpacing="sm">
                    <Table.Thead>
                      <Table.Tr><Table.Th>Product</Table.Th><Table.Th>Category</Table.Th><Table.Th>Retail price</Table.Th><Table.Th>Stock</Table.Th><Table.Th>Last stock update</Table.Th><Table.Th>Status</Table.Th><Table.Th ta="right">Actions</Table.Th></Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {filteredProducts.map(product => {
                        const stock = getStockState(product);
                        return (
                          <Table.Tr key={product.id}>
                            <Table.Td><Text fw={500}>{product.name}</Text><Text size="xs" c="dimmed">{product.sku || 'No SKU'}{product.barcode ? ` · ${product.barcode}` : ''}</Text></Table.Td>
                            <Table.Td>{categoryNames.get(String(product.categoryId)) || product.categoryName || 'Uncategorized'}</Table.Td>
                            <Table.Td>{formatMoney(product.sellingPrice ?? product.price)}</Table.Td>
                            <Table.Td>{Number(product.stock || 0)} {product.uom || 'units'}</Table.Td>
                            <Table.Td><Text size="xs">{formatStockUpdate(product.lastStockAdjustmentAt)}</Text><Text size="xs" c="dimmed">Cost {formatMoney(product.costPrice)}</Text></Table.Td>
                            <Table.Td><Badge color={product.isActive === false ? 'gray' : stock.color} variant="light">{product.isActive === false ? 'Inactive' : stock.label}</Badge></Table.Td>
                            <Table.Td>{renderActions(product)}</Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Paper>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="categories" pt="md">
          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm">
              <div><Text fw={600}>Product categories</Text><Text size="xs" c="dimmed">Used to organize and filter the catalog.</Text></div>
              <Button leftSection={<IconPlus size={16} />} onClick={() => setCategoryModalOpened(true)}>Add category</Button>
            </Group>
            {categories.length === 0 ? <Text c="dimmed" py="md">No categories yet.</Text> : (
              <Table>
                <Table.Thead><Table.Tr><Table.Th>Category</Table.Th><Table.Th>Products</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {categories.map(category => (
                    <Table.Tr key={category.id}><Table.Td>{category.name}</Table.Td><Table.Td>{products.filter(product => String(product.categoryId) === String(category.id)).length}</Table.Td></Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Tabs.Panel>
      </Tabs>

      <ProductModal opened={productModalOpened} onClose={() => setProductModalOpened(false)} product={selectedProduct} onRefresh={loadData} />
      <CategoryModal opened={categoryModalOpened} onClose={() => setCategoryModalOpened(false)} onRefresh={loadData} />
      <StockAdjustmentModal opened={Boolean(stockProduct)} onClose={() => setStockProduct(null)} product={stockProduct} onConfirm={handleAddStock} loading={stockLoading} />
    </Stack>
  );
}