import React, { useEffect, useState } from 'react';
import {
  Accordion,
  Alert,
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconBarcode, IconBox, IconCurrencyNaira, IconDeviceFloppy, IconPackage, IconPlus, IconX } from '@tabler/icons-react';
import { productService } from '../../services/productService';
import { categoryService } from '../../services/categoryService';
import BarcodeScannerInput from '../common/BarcodeScannerInput';
import { getProductEntryMode, PRODUCT_ENTRY_MODES, saveProductEntryMode } from '../../utils/productEntryModes';

const createEmptyProduct = () => ({
  entryMode: 'wholesale',
  name: '',
  categoryId: '',
  sku: '',
  barcode: '',
  costPrice: '',
  sellingPrice: '',
  wholesalePrice: '',
  stock: '',
  uom: 'Pieces',
  itemsPerPack: 1,
  reorderPoint: 5,
  location: '',
  supplierName: '',
  isActive: true,
  hasCarton: false,
  piecesPerCarton: 12,
  pricePerCarton: '',
  hasCrate: false,
  piecesPerCrate: 24,
  pricePerCrate: ''
});

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export default function ProductModal({ opened, onClose, product, onRefresh }) {
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState(createEmptyProduct);
  const [loading, setLoading] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [error, setError] = useState('');
  const isMobile = useMediaQuery('(max-width: 48em)');

  useEffect(() => {
    if (!opened) return;
    setError('');
    setAddingCategory(false);
    setNewCategoryName('');
    setFormData(product ? {
      ...createEmptyProduct(),
      entryMode: getProductEntryMode(product),
      name: product.name || '',
      categoryId: product.categoryId ? String(product.categoryId) : '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      costPrice: product.costPrice ?? '',
      sellingPrice: product.sellingPrice ?? product.price ?? '',
      wholesalePrice: product.wholesalePrice ?? '',
      stock: product.stock ?? '',
      uom: product.uom || 'Pieces',
      itemsPerPack: product.itemsPerPack ?? 1,
      reorderPoint: product.minStockAlert ?? product.reorderPoint ?? 5,
      location: product.location || '',
      supplierName: product.supplierName || '',
      isActive: product.isActive !== false,
      hasCarton: Boolean(product.hasCarton),
      piecesPerCarton: product.piecesPerCarton ?? 12,
      pricePerCarton: product.pricePerCarton ?? '',
      hasCrate: Boolean(product.hasCrate),
      piecesPerCrate: product.piecesPerCrate ?? 24,
      pricePerCrate: product.pricePerCrate ?? ''
    } : { ...createEmptyProduct(), entryMode: getProductEntryMode() });

    categoryService.getCategories()
      .then(data => setCategories((data || []).map(category => ({ value: String(category.id), label: category.name }))))
      .catch(err => {
        console.error('Failed to load product categories:', err);
        setError('Categories could not be loaded. You can still enter the product details and retry.');
      });
  }, [opened, product]);

  const setField = (field, value) => setFormData(current => ({ ...current, [field]: value }));
  const categoryOptions = categories;
  const uomOptions = [
    { value: 'Pieces', label: 'Pieces' },
    { value: 'Pack', label: 'Pack' },
    { value: 'Carton', label: 'Carton' },
    { value: 'Kg', label: 'Kilogram' },
    { value: 'Liters', label: 'Liters' }
  ];

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoryLoading(true);
    try {
      const category = await categoryService.addCategory({
        name,
        slug: name.toLowerCase().trim().replace(/\s+/g, '-')
      });
      const updated = await categoryService.getCategories();
      setCategories((updated || []).map(item => ({ value: String(item.id), label: item.name })));
      setField('categoryId', String(category.id));
      setNewCategoryName('');
      setAddingCategory(false);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not create category.');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = formData.name.trim();
    if (!name) {
      setError('Enter a product name.');
      return;
    }

    setLoading(true);
    setError('');
    const sellingPrice = toNumber(formData.sellingPrice);
    const reorderPoint = toNumber(formData.reorderPoint, 5);
    const payload = {
      ...formData,
      name,
      entryMode: formData.entryMode,
      categoryId: formData.categoryId || null,
      costPrice: toNumber(formData.costPrice),
      sellingPrice,
      price: sellingPrice,
      wholesalePrice: formData.entryMode === 'wholesale' ? sellingPrice : toNumber(formData.wholesalePrice),
      stock: toNumber(formData.stock),
      openingStock: product ? product.openingStock : toNumber(formData.stock),
      itemsPerPack: Math.max(1, toNumber(formData.itemsPerPack, 1)),
      reorderPoint,
      minStockAlert: reorderPoint,
      piecesPerCarton: formData.hasCarton ? Math.max(1, toNumber(formData.piecesPerCarton, 1)) : null,
      pricePerCarton: formData.hasCarton ? toNumber(formData.pricePerCarton) : null,
      piecesPerCrate: formData.hasCrate ? Math.max(1, toNumber(formData.piecesPerCrate, 1)) : null,
      pricePerCrate: formData.hasCrate ? toNumber(formData.pricePerCrate) : null
    };

    try {
      if (product) await productService.updateProduct(product.id, payload);
      else await productService.addProduct(payload);
      await onRefresh?.();
      notifications.show({ title: product ? 'Product updated' : 'Product added', message: `${name} was saved.`, color: 'teal' });
      onClose();
    } catch (err) {
      console.error('Failed to save product:', err);
      setError(err.message || 'Could not save product. Check the details and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={product ? 'Edit product' : 'Add product'}
      centered
      size="xl"
      fullScreen={isMobile}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      scrollAreaComponent="div"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {error && <Alert color="red" variant="light" title="Needs attention">{error}</Alert>}

          <SegmentedControl
            fullWidth
            value={formData.entryMode}
            onChange={value => {
              const mode = value || 'wholesale';
              setField('entryMode', mode);
              saveProductEntryMode(mode);
            }}
            data={PRODUCT_ENTRY_MODES}
            styles={{ label: { whiteSpace: 'normal', lineHeight: 1.2 } }}
          />

          {formData.entryMode === 'wholesale' ? (
            <Grid>
              <Grid.Col span={12}>
                <TextInput label="Product name" placeholder="e.g. Cooking oil, 5L" value={formData.name} onChange={event => setField('name', event.currentTarget.value)} required autoFocus={!isMobile} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Group align="flex-end" wrap="nowrap">
                  <Select label="Category" placeholder="Choose a category" data={categoryOptions} value={formData.categoryId || null} onChange={value => setField('categoryId', value || '')} searchable clearable style={{ flex: 1 }} />
                  <Button type="button" variant="light" onClick={() => setAddingCategory(value => !value)} aria-label="Add category"><IconPlus size={16} /></Button>
                </Group>
                {addingCategory && <Group mt="xs" align="flex-end"><TextInput label="New category" value={newCategoryName} onChange={event => setNewCategoryName(event.currentTarget.value)} style={{ flex: 1 }} /><Button type="button" onClick={handleCreateCategory} loading={categoryLoading}>Save category</Button></Group>}
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Select label="Unit of measure" data={uomOptions} value={formData.uom} onChange={value => setField('uom', value || 'Pieces')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <BarcodeScannerInput label="Barcode" placeholder="Optional barcode" value={formData.barcode} onChange={value => setField('barcode', value)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <NumberInput label="Low-stock alert at" min={0} value={formData.reorderPoint} onChange={value => setField('reorderPoint', value)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <NumberInput label="Buying price" leftSection="₦" min={0.01} decimalScale={2} value={formData.costPrice} onChange={value => setField('costPrice', value)} required />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <NumberInput label="Selling price" leftSection="₦" min={0} decimalScale={2} value={formData.sellingPrice} onChange={value => setField('sellingPrice', value)} required />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <NumberInput label={product ? 'Current quantity' : 'Quantity'} min={0} value={formData.stock} onChange={value => setField('stock', value)} disabled={!!product} required={!product} />
              </Grid.Col>
              {product && <Grid.Col span={12}><Text size="xs" c="dimmed">Use Add stock from the product list to change quantity.</Text></Grid.Col>}
            </Grid>
          ) : (
          <Accordion defaultValue="basic">
            <Accordion.Item value="basic">
              <Accordion.Control icon={<IconPackage size={18} />}>Product details</Accordion.Control>
              <Accordion.Panel>
                <Grid>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput label="Product name" placeholder="e.g. Coca Cola 50cl" value={formData.name} onChange={event => setField('name', event.currentTarget.value)} required autoFocus={!isMobile} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Group align="flex-end" wrap="nowrap">
                      <Select label="Category" placeholder="Choose a category" data={categoryOptions} value={formData.categoryId || null} onChange={value => setField('categoryId', value || '')} searchable clearable style={{ flex: 1 }} />
                      <Button type="button" variant="light" onClick={() => setAddingCategory(value => !value)} aria-label="Add category"><IconPlus size={16} /></Button>
                    </Group>
                    {addingCategory && <Group mt="xs" align="flex-end"><TextInput label="New category" value={newCategoryName} onChange={event => setNewCategoryName(event.currentTarget.value)} style={{ flex: 1 }} /><Button type="button" onClick={handleCreateCategory} loading={categoryLoading}>Save category</Button></Group>}
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput label="SKU" placeholder="Optional stock code" value={formData.sku} onChange={event => setField('sku', event.currentTarget.value)} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <BarcodeScannerInput label="Barcode" placeholder="Scan or enter barcode" value={formData.barcode} onChange={value => setField('barcode', value)} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select label="Stock unit" data={uomOptions} value={formData.uom} onChange={value => setField('uom', value || 'Pieces')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <NumberInput label="Items per pack" min={1} value={formData.itemsPerPack} onChange={value => setField('itemsPerPack', value)} />
                  </Grid.Col>
                </Grid>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="pricing">
              <Accordion.Control icon={<IconCurrencyNaira size={18} />}>Prices</Accordion.Control>
              <Accordion.Panel>
                <Grid>
                  <Grid.Col span={{ base: 12, sm: 4 }}><NumberInput label="Buying price" leftSection="₦" min={0.01} decimalScale={2} value={formData.costPrice} onChange={value => setField('costPrice', value)} required /></Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}><NumberInput label="Retail price" leftSection="₦" min={0} decimalScale={2} value={formData.sellingPrice} onChange={value => setField('sellingPrice', value)} required /></Grid.Col>
                  {formData.entryMode === 'general' && <Grid.Col span={{ base: 12, sm: 4 }}><NumberInput label="Wholesale price" leftSection="₦" min={0} decimalScale={2} value={formData.wholesalePrice} onChange={value => setField('wholesalePrice', value)} /></Grid.Col>}
                </Grid>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="stock">
              <Accordion.Control icon={<IconPackage size={18} />}>Stock</Accordion.Control>
              <Accordion.Panel>
                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <NumberInput label={product ? 'Current stock' : 'Opening stock'} min={0} value={formData.stock} onChange={value => setField('stock', value)} disabled={!!product} required={!product} />
                    {product && <Text size="xs" c="dimmed" mt={4}>Use Add stock from the product list to change stock safely.</Text>}
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}><NumberInput label="Reorder alert at" min={0} value={formData.reorderPoint} onChange={value => setField('reorderPoint', value)} /></Grid.Col>
                  <Grid.Col span={12}><Switch label="Product is active and available at checkout" checked={formData.isActive} onChange={event => setField('isActive', event.currentTarget.checked)} /></Grid.Col>
                </Grid>
              </Accordion.Panel>
            </Accordion.Item>

            {formData.entryMode === 'general' && <Accordion.Item value="packages">
              <Accordion.Control icon={<IconBox size={18} />}>Carton and crate prices</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  <Switch label="Sell by carton" checked={formData.hasCarton} onChange={event => setField('hasCarton', event.currentTarget.checked)} />
                  {formData.hasCarton && <Grid><Grid.Col span={{ base: 12, sm: 6 }}><NumberInput label="Pieces per carton" min={1} value={formData.piecesPerCarton} onChange={value => setField('piecesPerCarton', value)} /></Grid.Col><Grid.Col span={{ base: 12, sm: 6 }}><NumberInput label="Carton price" leftSection="₦" min={0} decimalScale={2} value={formData.pricePerCarton} onChange={value => setField('pricePerCarton', value)} /></Grid.Col></Grid>}
                  <Switch label="Sell by crate" checked={formData.hasCrate} onChange={event => setField('hasCrate', event.currentTarget.checked)} />
                  {formData.hasCrate && <Grid><Grid.Col span={{ base: 12, sm: 6 }}><NumberInput label="Pieces per crate" min={1} value={formData.piecesPerCrate} onChange={value => setField('piecesPerCrate', value)} /></Grid.Col><Grid.Col span={{ base: 12, sm: 6 }}><NumberInput label="Crate price" leftSection="₦" min={0} decimalScale={2} value={formData.pricePerCrate} onChange={value => setField('pricePerCrate', value)} /></Grid.Col></Grid>}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>}

            <Accordion.Item value="supplier">
              <Accordion.Control icon={<IconBarcode size={18} />}>Supplier and location</Accordion.Control>
              <Accordion.Panel>
                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Supplier" placeholder="Supplier or distributor" value={formData.supplierName} onChange={event => setField('supplierName', event.currentTarget.value)} /></Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Shelf / bin location" placeholder="e.g. Aisle 2, Shelf B" value={formData.location} onChange={event => setField('location', event.currentTarget.value)} /></Grid.Col>
                </Grid>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          )}

          <Group justify="flex-end" mt="sm">
            <Button type="button" variant="default" onClick={onClose} disabled={loading} leftSection={<IconX size={16} />}>Cancel</Button>
            <Button type="submit" loading={loading} leftSection={<IconDeviceFloppy size={16} />}>{product ? 'Save changes' : 'Save product'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}