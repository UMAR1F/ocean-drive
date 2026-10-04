// src/components/dashboard/SyncStatusPage.jsx
import React, { useState, useEffect } from 'react';
import { 
  Box, Title, Text, Card, Group, Badge, Button, Table, Alert, Loader 
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { syncService } from '../../services/syncService';
import { offlineDb } from '../../services/offlineDb';
import { useAuth } from '../../context/AuthContext';

export default function SyncStatusPage() {
  const { currentUser, user } = useAuth();
  const activeUser = currentUser || user;
  const userId = activeUser?.uid || activeUser?.id || 'unknown';
  const isAdmin = activeUser?.role === 'admin' || activeUser?.isAdmin || activeUser?.userRole === 'admin';

  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);

    loadSyncQueue();

    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, [activeUser]);

  const loadSyncQueue = async () => {
    try {
      setLoading(true);
      const items = await offlineDb.getAll('offlineQueue');
      const allItems = Array.isArray(items) ? items : [];

      if (!isAdmin) {
        setQueueItems(allItems.filter(item => 
          item.data?.cashierId === userId || item.cashierId === userId
        ));
      } else {
        // Admin views all pending queue logs across the enterprise system
        setQueueItems(allItems);
      }
    } catch (err) {
      console.error("Failed to load sync queue:", err);
      notifications.show({ title: 'Error', message: 'Could not load sync queue logs.', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (!navigator.onLine) {
      notifications.show({ title: 'Offline', message: 'Cannot sync while offline. Connect to the internet first.', color: 'yellow' });
      return;
    }

    try {
      setSyncing(true);
      // Fixed: calling the actual method implemented in syncService.js
      await syncService.syncPendingQueue();
      
      notifications.show({ title: 'Success', message: 'Sync queue processed successfully.', color: 'teal' });
      loadSyncQueue();
    } catch (err) {
      console.error("Manual sync error:", err);
      notifications.show({ title: 'Sync Failed', message: err.message || 'An error occurred during synchronization.', color: 'red' });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Box ta="center" py="xl">
        <Loader size="lg" />
        <Text size="sm" c="dimmed" mt="md">Loading sync monitor...</Text>
      </Box>
    );
  }

  return (
    <Box p={{ base: 'xs', md: 'md' }}>
      <Group justify="space-between" mb="lg" wrap="wrap">
        <Box>
          <Title order={2}>Sync Monitor</Title>
          <Text size="sm" c="dimmed">
            {isAdmin ? 'System-wide view of pending offline operations and network upload queues.' : 'Track your pending offline sales and network upload queue.'}
          </Text>
        </Box>
        <Group>
          <Badge size="lg" color={isOnline ? 'green' : 'red'} variant="light">
            {isOnline ? 'Online (Connected)' : 'Offline Mode'}
          </Badge>
          <Button 
            color="blue" 
            onClick={handleManualSync} 
            loading={syncing}
            disabled={!isOnline || queueItems.length === 0}
          >
            {isAdmin ? 'Sync All Pending Queue' : 'Sync My Queue'}
          </Button>
        </Group>
      </Group>

      <Group grow mb="lg">
        <Card withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {isAdmin ? 'Total System Queue Items' : 'My Pending Items'}
          </Text>
          <Text size="xl" fw={700} c={queueItems.length > 0 ? 'yellow' : 'green'} mt={4}>
            {queueItems.length} {queueItems.length === 1 ? 'item' : 'items'}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {isAdmin ? 'Awaiting synchronization to Firestore' : 'Awaiting upload from your session'}
          </Text>
        </Card>

        <Card withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Account Scope</Text>
          <Text size="xl" fw={700} c="indigo" mt={4}>
            {isAdmin ? 'Administrator (Full Access)' : 'Cashier View'}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>{activeUser?.email || userId}</Text>
        </Card>
      </Group>

      {queueItems.length === 0 ? (
        <Alert color="teal" title="All Records Synced" radius="md">
          {isAdmin ? 'There are no pending local transactions or failed sync records across the entire system.' : 'You have no pending local transactions or failed sync records awaiting upload.'}
        </Alert>
      ) : (
        <Card withBorder radius="md" p="md">
          <Text fw={600} size="md" mb="md">
            {isAdmin ? 'All Pending Enterprise Queue Entries' : 'Your Pending Queue Entries'}
          </Text>
          <Table.ScrollContainer minWidth={600}>
            <Table highlightOnHover striped verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Action Type</Table.Th>
                  <Table.Th>Reference / ID</Table.Th>
                  <Table.Th>Details / Value</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {queueItems.map((item, index) => (
                  <Table.Tr key={item.dbKey || item.localId || index}>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={item.type === 'COMPLETE_SALE' ? 'blue' : item.type === 'DECREMENT_STOCK' ? 'orange' : 'gray'}>
                        {item.type || 'UNKNOWN'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {item.localId || item.productId || item.saleId || 'N/A'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {item.data?.total ? `Total: ₦${item.data.total}` : item.quantitySold ? `Qty Dec: ${item.quantitySold}` : 'Queued Action'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}
    </Box>
  );
}