// src/components/inventory/InventoryManager.jsx
import React, { useState } from 'react';
import { Tabs, Paper, Stack } from '@mantine/core';
import { IconPackage, IconTags, IconPlus } from '@tabler/icons-react';
import ProductsPage from './ProductsPage';
import CategoriesPage from './CategoriesPage';
import ProductFormPage from './ProductFormPage';

export default function InventoryManager() {
  const [activeTab, setActiveTab] = useState('products');
  const [editingProductId, setEditingProductId] = useState(null);

  const handleOpenAddForm = () => {
    setEditingProductId(null);
    setActiveTab('form');
  };

  const handleOpenEditForm = (productId) => {
    setEditingProductId(productId);
    setActiveTab('form');
  };

  return (
    <Stack maw={1200} mx="auto" gap="lg" p={{ base: 'xs', sm: 'md' }}>
      <Paper shadow="xs" radius="md" withBorder p="xs">
        <Tabs value={activeTab} onChange={setActiveTab} color="blue">
          <Tabs.List>
            <Tabs.Tab value="products" leftSection={<IconPackage size={16} />}>
              Products
            </Tabs.Tab>
            <Tabs.Tab value="categories" leftSection={<IconTags size={16} />}>
              Categories
            </Tabs.Tab>
            <Tabs.Tab value="form" leftSection={<IconPlus size={16} />}>
              {editingProductId ? 'Edit Product' : 'Add Product'}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="products" pt="md">
            <ProductsPage 
              onEditProduct={handleOpenEditForm}
              onAddNewProduct={handleOpenAddForm}
            />
          </Tabs.Panel>

          <Tabs.Panel value="categories" pt="md">
            <CategoriesPage />
          </Tabs.Panel>

          <Tabs.Panel value="form" pt="md">
            <ProductFormPage 
              productId={editingProductId}
              onSaveSuccess={() => {
                setEditingProductId(null);
                setActiveTab('products');
              }}
              onCancel={() => {
                setEditingProductId(null);
                setActiveTab('products');
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}