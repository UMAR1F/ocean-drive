// src/components/inventory/CategoryModal.jsx
import React, { useState } from 'react';
import { Modal, TextInput, Button, Group, Stack } from '@mantine/core';
import { inventoryService } from '../../services/inventoryService';
import { notifications } from '@mantine/notifications';

export default function CategoryModal({ opened, onClose, onRefresh }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setLoading(true);
    try {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      await inventoryService.addCategory({ name, slug });
      
      notifications.show({
        title: 'Success',
        message: 'Category created successfully!',
        color: 'green',
      });
      
      setName('');
      onRefresh();
      onClose();
    } catch (err) {
      console.error("Failed to create category:", err);
      notifications.show({
        title: 'Error',
        message: 'Failed to create category. Try again.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal 
      opened={opened} 
      onClose={onClose} 
      title="Add New Category"
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          <TextInput
            label="Category Name"
            placeholder="e.g. Beverages, Snacks"
            required
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Save Category
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}