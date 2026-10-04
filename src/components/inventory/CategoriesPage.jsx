// src/components/inventory/CategoriesPage.jsx
import React, { useState, useEffect } from 'react';
import { 
  Title, 
  TextInput, 
  Button, 
  Paper, 
  Group, 
  Loader, 
  Center, 
  Stack, 
  Text,
  Table,
  ActionIcon
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconTrash, IconEdit, IconPlus } from '@tabler/icons-react';
import { categoryService } from '../../services/categoryService';

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);

  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await categoryService.getCategories();
      setCategories(data || []);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    
    try {
      if (editingId) {
        await categoryService.updateCategory(editingId, { name: name.trim(), slug });
        setEditingId(null);
      } else {
        await categoryService.addCategory({ name: name.trim(), slug });
      }
      setName('');
      loadCategories();
    } catch (error) {
      console.error("Error saving category:", error);
    }
  };

  const handleEdit = (category) => {
    setEditingId(category.id);
    setName(category.name || '');
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this category?")) {
      try {
        await categoryService.deleteCategory(id);
        loadCategories();
      } catch (error) {
        console.error("Error deleting category:", error);
      }
    }
  };

  if (loading) {
    return (
      <Center h={300}>
        <Loader size="md" />
      </Center>
    );
  }

  return (
    <Stack maw={900} mx="auto" gap="lg" p={{ base: 'xs', sm: 'md' }}>
      <Title order={2} size="h3">Categories Management</Title>

      {/* Form Section */}
      <Paper component="form" onSubmit={handleSubmit} shadow="xs" p={{ base: 'sm', sm: 'md' }} radius="md" withBorder>
        <Stack gap="sm">
          <TextInput
            label={editingId ? "Edit Category Name" : "New Category Name"}
            placeholder="Enter category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Stack>

        <Group justify="flex-end" mt="md" gap="sm">
          {editingId && (
            <Button 
              variant="default" 
              onClick={() => { setEditingId(null); setName(''); }}
              fullWidth={isMobile}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" color={editingId ? "green" : "blue"} leftSection={<IconPlus size={16} />} fullWidth={isMobile}>
            {editingId ? 'Update Category' : 'Add Category'}
          </Button>
        </Group>
      </Paper>

      {/* Categories Listing Section */}
      {isMobile ? (
        <Stack gap="sm">
          <Text fw={600} size="sm" c="dimmed">Category List ({categories.length})</Text>
          {categories.map((cat) => (
            <Paper key={cat.id} shadow="xs" p="sm" radius="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600}>{cat.name}</Text>
                <Text size="xs" c="dimmed">{cat.slug}</Text>
              </Group>
              <Group justify="flex-end" gap="xs" mt="sm">
                <Button size="compact-sm" variant="light" color="blue" leftSection={<IconEdit size={14} />} onClick={() => handleEdit(cat)}>
                  Edit
                </Button>
                <Button size="compact-sm" variant="light" color="red" leftSection={<IconTrash size={14} />} onClick={() => handleDelete(cat.id)}>
                  Delete
                </Button>
              </Group>
            </Paper>
          ))}
          {categories.length === 0 && (
            <Paper p="xl" ta="center" withBorder>
              <Text c="dimmed">No categories found.</Text>
            </Paper>
          )}
        </Stack>
      ) : (
        <Paper shadow="xs" radius="md" withBorder overflow="hidden">
          <Table.ScrollContainer minWidth={400}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Slug</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {categories.map((cat) => (
                  <Table.Tr key={cat.id}>
                    <Table.Td fw={500}>{cat.name}</Table.Td>
                    <Table.Td c="dimmed">{cat.slug}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Group gap="xs" justify="flex-end">
                        <ActionIcon variant="light" color="blue" onClick={() => handleEdit(cat)} title="Edit category">
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon variant="light" color="red" onClick={() => handleDelete(cat.id)} title="Delete category">
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {categories.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={3} align="center" py="xl" c="dimmed">
                      No categories found.
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}