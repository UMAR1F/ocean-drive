// src/components/inventory/ProductFormPage.jsx
import React, { useState, useEffect } from "react";
import { 
  Title, 
  TextInput, 
  NumberInput, 
  Select, 
  Button, 
  Paper, 
  Group, 
  Loader, 
  Center, 
  Stack,
  Switch,
  Grid,
  Text,
  Accordion,
  SegmentedControl
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconDeviceFloppy, IconX, IconCurrencyNaira, IconBoxSeam, IconBarcode } from "@tabler/icons-react";
import { inventoryService } from "../../services/inventoryService";
import BarcodeScannerInput from "../common/BarcodeScannerInput";
import { getProductEntryMode, PRODUCT_ENTRY_MODES, saveProductEntryMode } from "../../utils/productEntryModes";
import { notifications } from '@mantine/notifications';

export default function ProductFormPage({ productId, onSaveSuccess, onCancel }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const initialFormState = {
    entryMode: 'wholesale',
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    costPrice: '',
    sellingPrice: '',
    wholesalePrice: '',
    uom: 'Pieces',
    itemsPerPack: 1,
    stock: '',
    reorderPoint: 5,
    location: '',
    supplierName: '',
    isActive: true
  };

  const [formData, setFormData] = useState(initialFormState);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    loadInitialData();
  }, [productId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const fetchedCategories = await inventoryService.getCategories();
      setCategories(fetchedCategories || []);

      if (productId) {
        const products = await inventoryService.getAllProducts();
        const currentProduct = products.find(p => String(p.id) === String(productId));
        if (currentProduct) {
          setFormData({
            entryMode: getProductEntryMode(currentProduct),
            name: currentProduct.name || '',
            sku: currentProduct.sku || '',
            barcode: currentProduct.barcode || '',
            categoryId: currentProduct.categoryId || '',
            costPrice: currentProduct.costPrice ?? '',
            sellingPrice: currentProduct.sellingPrice ?? currentProduct.price ?? '',
            wholesalePrice: currentProduct.wholesalePrice ?? '',
            uom: currentProduct.uom || 'Pieces',
            itemsPerPack: currentProduct.itemsPerPack ?? 1,
            stock: currentProduct.stock ?? '',
            reorderPoint: currentProduct.reorderPoint ?? currentProduct.minStockAlert ?? 5,
            location: currentProduct.location || '',
            supplierName: currentProduct.supplierName || '',
            isActive: currentProduct.isActive ?? true
          });
        }
      } else {
        setFormData(current => ({ ...current, entryMode: getProductEntryMode() }));
      }
    } catch (error) {
      console.error("Error loading product form data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = {
      ...formData,
      name: formData.name.trim(),
      costPrice: Number(formData.costPrice) || 0,
      sellingPrice: Number(formData.sellingPrice) || 0,
      wholesalePrice: formData.entryMode === 'wholesale'
        ? Number(formData.sellingPrice) || 0
        : Number(formData.wholesalePrice) || 0,
      stock: Number(formData.stock) || 0,
      itemsPerPack: Number(formData.itemsPerPack) || 1,
      reorderPoint: Number(formData.reorderPoint) || 0,
    };

    try {
      if (productId) {
        await inventoryService.updateProduct(productId, payload);
      } else {
        await inventoryService.addProduct(payload);
      }
      if (onSaveSuccess) onSaveSuccess();
    } catch (error) {
      console.error("Error saving product record:", error);
      notifications.show({ title: 'Product was not added', message: error.message || 'Could not save the product.', color: 'red' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Center h={300}>
        <Loader size="md" />
      </Center>
    );
  }

  const categoryOptions = categories.map((cat) => ({
    value: String(cat.id),
    label: cat.name,
  }));

  const uomOptions = [
    { value: 'Pieces', label: 'Pieces (Pcs)' },
    { value: 'Pack', label: 'Pack' },
    { value: 'Carton', label: 'Carton' },
    { value: 'Kg', label: 'Kilogram (Kg)' },
    { value: 'Liters', label: 'Liters (L)' }
  ];

  return (
    <Paper component="form" onSubmit={handleSubmit} shadow="sm" radius="md" withBorder>
      <Stack gap="md" p={{ base: 'sm', sm: 'md' }}>
        <Group justify="space-between" align="center">
          <Title order={2} size="h3">
            {productId ? 'Edit Product Record' : 'Create New Product'}
          </Title>
          <Text size="sm" c="dimmed">* Required fields</Text>
        </Group>

        <SegmentedControl
          fullWidth
          value={formData.entryMode}
          onChange={(value) => {
            const mode = value || 'wholesale';
            setFormData((current) => ({ ...current, entryMode: mode }));
            saveProductEntryMode(mode);
          }}
          data={PRODUCT_ENTRY_MODES}
          styles={{ label: { whiteSpace: 'normal', lineHeight: 1.2 } }}
        />

        {formData.entryMode === 'wholesale' ? (
          <Grid>
            <Grid.Col span={12}>
              <TextInput
                label="Product name"
                placeholder="e.g. Cooking oil, 5L"
                value={formData.name}
                onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Select label="Category" placeholder="Choose a category" data={categoryOptions} value={formData.categoryId ? String(formData.categoryId) : null} onChange={(value) => setFormData((current) => ({ ...current, categoryId: value || '' }))} searchable clearable />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Select label="Unit of measure" data={uomOptions} value={formData.uom} onChange={(value) => setFormData((current) => ({ ...current, uom: value || 'Pieces' }))} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <BarcodeScannerInput label="Barcode" placeholder="Optional barcode" value={formData.barcode} onChange={(value) => setFormData((current) => ({ ...current, barcode: value }))} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <NumberInput label="Low-stock alert at" value={formData.reorderPoint} onChange={(value) => setFormData((current) => ({ ...current, reorderPoint: value }))} min={0} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <NumberInput label="Buying price" placeholder="0.00" leftSection={<IconCurrencyNaira size={16} />} value={formData.costPrice} onChange={(value) => setFormData((current) => ({ ...current, costPrice: value }))} min={0.01} required />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <NumberInput label="Selling price" placeholder="0.00" leftSection={<IconCurrencyNaira size={16} />} value={formData.sellingPrice} onChange={(value) => setFormData((current) => ({ ...current, sellingPrice: value }))} min={0} required />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <NumberInput label={productId ? 'Current quantity' : 'Quantity'} placeholder="0" value={formData.stock} onChange={(value) => setFormData((current) => ({ ...current, stock: value }))} min={0} required />
            </Grid.Col>
            {productId && <Grid.Col span={12}><Text size="xs" c="dimmed">Set the current quantity here. Use Add stock to record newly received stock.</Text></Grid.Col>}
          </Grid>
        ) : (
        <Accordion defaultValue="basic" variant="contained">
          {/* Basic Info Section */}
          <Accordion.Item value="basic">
            <Accordion.Control icon={<IconBoxSeam size={20} color="gray" />}>
              <Text fw={500}>Basic Information (Required)</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Grid>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <TextInput
                    label="Product Name"
                    placeholder="e.g. Coca Cola 50cl"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Select
                    label="Category"
                    placeholder="Select category"
                    data={categoryOptions}
                    value={formData.categoryId ? String(formData.categoryId) : null}
                    onChange={(val) => setFormData({ ...formData, categoryId: val || '' })}
                    searchable
                    clearable
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 4 }}>
                  <NumberInput
                    label="Quantity / Stock Level"
                    placeholder="0"
                    value={formData.stock}
                    onChange={(val) => setFormData({ ...formData, stock: val })}
                    min={0}
                    required
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 4 }}>
                  <NumberInput
                    label="Selling Price (Retail)"
                    placeholder="0.00"
                    leftSection={<IconCurrencyNaira size={16} />}
                    value={formData.sellingPrice}
                    onChange={(val) => setFormData({ ...formData, sellingPrice: val })}
                    min={0}
                    required
                  />
                </Grid.Col>
                {formData.entryMode === 'general' && <Grid.Col span={{ base: 6, md: 4 }}>
                  <NumberInput
                    label="Wholesale Price"
                    placeholder="0.00"
                    leftSection={<IconCurrencyNaira size={16} />}
                    value={formData.wholesalePrice}
                    onChange={(val) => setFormData({ ...formData, wholesalePrice: val })}
                    min={0}
                  />
                </Grid.Col>}
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <NumberInput
                    label="Cost Price"
                    placeholder="0.00"
                    leftSection={<IconCurrencyNaira size={16} />}
                    value={formData.costPrice}
                    onChange={(val) => setFormData({ ...formData, costPrice: val })}
                    min={0.01}
                    required
                  />
                </Grid.Col>
              </Grid>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Advanced / Identifiers Details */}
          <Accordion.Item value="advanced">
            <Accordion.Control icon={<IconBarcode size={20} color="gray" />}>
              <Text fw={500}>Identifiers & Advanced Details</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Grid>
                {formData.entryMode === 'general' && <Grid.Col span={{ base: 12, md: 6 }}>
                  <TextInput
                    label="SKU (Stock Keeping Unit)"
                    placeholder="Unique SKU code"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </Grid.Col>}
                <Grid.Col span={{ base: 12, md: 6 }}>
                  {/* Integrated Barcode & Mobile Camera Scanner Component */}
                  <BarcodeScannerInput
                    label="Barcode / UPC"
                    placeholder="Scan via hardware scanner or camera..."
                    value={formData.barcode}
                    onChange={(code) => setFormData({ ...formData, barcode: code })}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 3 }}>
                  <Select
                    label="Unit of Measure (UoM)"
                    data={uomOptions}
                    value={formData.uom}
                    onChange={(val) => setFormData({ ...formData, uom: val || 'Pieces' })}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 3 }}>
                  <NumberInput
                    label="Items Per Pack / Case"
                    placeholder="1"
                    value={formData.itemsPerPack}
                    onChange={(val) => setFormData({ ...formData, itemsPerPack: val })}
                    min={1}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 3 }}>
                  <NumberInput
                    label="Reorder Point (Low Stock Alert)"
                    placeholder="5"
                    value={formData.reorderPoint}
                    onChange={(val) => setFormData({ ...formData, reorderPoint: val })}
                    min={0}
                  />
                </Grid.Col>
                {formData.entryMode === 'general' && <Grid.Col span={{ base: 12, md: 4 }}>
                  <TextInput
                    label="Location / Shelf / Bin"
                    placeholder="e.g. Aisle 2, Shelf B"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </Grid.Col>}
                {formData.entryMode === 'general' && <Grid.Col span={{ base: 12, md: 8 }}>
                  <TextInput
                    label="Supplier Name"
                    placeholder="Primary vendor or distributor"
                    value={formData.supplierName}
                    onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                  />
                </Grid.Col>}
                {formData.entryMode === 'general' && <Grid.Col span={{ base: 12, md: 4 }}>
                  <Group h="100%" align="flex-end" pb={4}>
                    <Switch
                      label="Status (Active)"
                      checked={formData.isActive}
                      onChange={(event) => setFormData({ ...formData, isActive: event.currentTarget.checked })}
                      color="green"
                      size="md"
                    />
                  </Group>
                </Grid.Col>}
              </Grid>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
        )}

        <Group justify="flex-end" mt="md" gap="sm">
          <Button 
            variant="default" 
            onClick={onCancel}
            leftSection={<IconX size={16} />}
            fullWidth={isMobile}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            color="blue" 
            loading={submitting}
            leftSection={<IconDeviceFloppy size={16} />}
            fullWidth={isMobile}
          >
            {productId ? 'Update Product Record' : 'Save Product Record'}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}