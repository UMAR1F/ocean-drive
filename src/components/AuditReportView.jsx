// src/components/dashboard/AuditReportView.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Paper, 
  Title, 
  Text, 
  Group, 
  Button, 
  TextInput, 
  Select, 
  Table, 
  Badge, 
  Loader, 
  Card, 
  Stack,
  ActionIcon,
  Tooltip,
  Modal,
  Divider,
  Box,
  Alert,
  Pagination
} from '@mantine/core';
import { 
  IconFileSpreadsheet, 
  IconSearch, 
  IconFilter, 
  IconRefresh, 
  IconUserExclamation 
} from '@tabler/icons-react';
import { auditService } from '../services/auditService';
import { notifications } from '@mantine/notifications';

const getActionCategory = (actionType = '') => {
  const action = actionType.toUpperCase();
  if (action.includes('SALE')) return 'SALE';
  if (action.includes('PRODUCT') || action.includes('STOCK') || action.includes('CATEGORY')) return 'INVENTORY';
  if (action.includes('USER') || action.includes('ROLE') || action.includes('AUTH')) return 'ACCESS';
  return 'OTHER';
};

const getLocalDateKey = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatLocalTimestamp = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Unknown time';
};

export function AuditReportView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [activePage, setActivePage] = useState(1);
  const pageSize = 25;
  
  // State for inspecting a single log's full details in a modal
  const [selectedLog, setSelectedLog] = useState(null);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await auditService.getAuditLogs();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load audit logs:", error);
      setError(error.message || 'Could not load audit history.');
      notifications.show({
        title: 'Error',
        message: 'Could not retrieve audit history logs.',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    setActivePage(1);
  }, [searchQuery, actionFilter, startDate, endDate]);

  // Filter and search logic
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const queryStr = (searchQuery || '').toLowerCase();
      const matchesSearch = 
        !queryStr ||
        (log.entityName || '').toLowerCase().includes(queryStr) ||
        (log.details || '').toLowerCase().includes(queryStr) ||
        (log.userName || '').toLowerCase().includes(queryStr) ||
        (log.entityId || '').toLowerCase().includes(queryStr) ||
        (log.actionType || '').toLowerCase().includes(queryStr);

      const matchesAction = actionFilter === 'ALL' || getActionCategory(log.actionType) === actionFilter;

      const logDate = getLocalDateKey(log.timestamp);
      const matchesStartDate = !startDate || logDate >= startDate;
      const matchesEndDate = !endDate || logDate <= endDate;

      return matchesSearch && matchesAction && matchesStartDate && matchesEndDate;
    });
  }, [logs, searchQuery, actionFilter, startDate, endDate]);

  const pageLogs = filteredLogs.slice((activePage - 1) * pageSize, activePage * pageSize);
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;

  const handleExport = async () => {
    try {
      if (filteredLogs.length === 0) {
        notifications.show({
          title: 'No Data',
          message: 'No audit records match your current filter criteria to export.',
          color: 'orange'
        });
        return;
      }

      setExporting(true);
      const result = await auditService.exportAuditsToExcel(filteredLogs);
      
      if (result?.aborted) {
        return; // User canceled mobile share sheet
      }

      notifications.show({
        title: 'Export Successful',
        message: result?.method === 'shared' 
          ? 'Spreadsheet ready to share via mobile apps!' 
          : `Successfully exported ${filteredLogs.length} audit rows to Excel!`,
        color: 'green'
      });
    } catch (err) {
      notifications.show({
        title: 'Export Failed',
        message: err.message || 'Failed to generate Excel sheet.',
        color: 'red'
      });
    } finally {
      setExporting(false);
    }
  };

  const getActionBadgeColor = (type = '') => {
    const category = getActionCategory(type);
    if (category === 'SALE') return 'teal';
    if (category === 'ACCESS') return 'violet';
    if (category === 'INVENTORY') return 'blue';
    return 'gray';
  };

  return (
    <Stack gap="lg" pb="xl">
      {/* Header & Controls */}
      <Group justify="space-between" align="center">
        <div>
          <Title order={2}>Audit Log</Title>
          <Text size="sm" c="dimmed">Review who changed what and when.</Text>
        </div>
        <Group>
          <Tooltip label="Refresh Logs">
            <ActionIcon variant="light" size="lg" onClick={fetchLogs} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Button 
            leftSection={<IconFileSpreadsheet size={18} />} 
            color="green" 
            onClick={handleExport}
            loading={exporting}
            disabled={filteredLogs.length === 0}
          >
            Export
          </Button>
        </Group>
      </Group>

      {/* Filter Toolbar Card */}
      <Card shadow="sm" p="md" radius="md" withBorder>
        <Stack gap="md">
          <Group grow preventGrowOverflow={false} wrap="wrap">
            <TextInput
              placeholder="Search action, item, person, or details..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ minWidth: '200px' }}
            />
            <Select
              aria-label="Activity type"
              leftSection={<IconFilter size={16} />}
              value={actionFilter}
              onChange={(val) => setActionFilter(val || 'ALL')}
              data={[
                { value: 'ALL', label: 'All activity' },
                { value: 'SALE', label: 'Sales and returns' },
                { value: 'INVENTORY', label: 'Inventory changes' },
                { value: 'ACCESS', label: 'Users and access' },
                { value: 'OTHER', label: 'Other activity' }
              ]}
              style={{ minWidth: '180px' }}
            />
            <TextInput
              type="date"
              label="From Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ minWidth: '140px' }}
            />
            <TextInput
              type="date"
              label="To Date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ minWidth: '140px' }}
            />
          </Group>
        </Stack>
      </Card>

      {error && <Alert icon={<IconUserExclamation size={16} />} title="Audit records unavailable" color="red" variant="light" mb="md">
        <Group justify="space-between" align="center">
          <Text size="sm">{error}</Text>
          <Button size="xs" variant="light" onClick={fetchLogs} loading={loading}>Retry</Button>
        </Group>
      </Alert>}

      {/* Audit Data Table Container with Horizontal Scroll Support */}
      <Paper shadow="sm" radius="md" withBorder style={{ overflow: 'hidden' }}>
        {loading ? (
          <Group justify="center" p="xl">
            <Loader size="lg" />
          </Group>
        ) : filteredLogs.length === 0 ? (
          <Stack align="center" justify="center" p="xl" gap="xs">
            <IconUserExclamation size={48} color="gray" />
            <Text fw={500} c="dimmed">No audit records match your filters.</Text>
            <Button 
              variant="subtle" 
              size="xs" 
              onClick={() => { setSearchQuery(''); setActionFilter('ALL'); setStartDate(''); setEndDate(''); }}
            >
              Reset Filters
            </Button>
          </Stack>
        ) : (
          <>
          <Group justify="space-between" px="md" pt="md">
            <Text size="sm" c="dimmed">Showing {Math.min(filteredLogs.length, (activePage - 1) * pageSize + 1)}–{Math.min(activePage * pageSize, filteredLogs.length)} of {filteredLogs.length} matching events</Text>
            <Text size="xs" c="dimmed">Times shown in local time</Text>
          </Group>
          <Table.ScrollContainer minWidth={900}>
            <Table horizontalSpacing="md" verticalSpacing="sm" highlightOnHover style={{ cursor: 'pointer' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: '170px' }}>Time</Table.Th>
                  <Table.Th style={{ width: '150px' }}>Action Type</Table.Th>
                  <Table.Th style={{ width: '180px' }}>Entity / Item</Table.Th>
                  <Table.Th>Details / Operation Data</Table.Th>
                  <Table.Th style={{ width: '140px' }}>Performed By</Table.Th>
                  <Table.Th style={{ width: '100px' }}>Role</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pageLogs.map((log, index) => (
                  <Table.Tr key={`${log.id || 'log'}_${index}`} onClick={() => setSelectedLog(log)}>
                    <Table.Td>
                      <Text size="xs" ff="monospace" style={{ whiteSpace: 'nowrap' }}>
                        {formatLocalTimestamp(log.timestamp)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getActionBadgeColor(log.actionType)} variant="light" size="sm">
                        {log.actionType || 'UNKNOWN'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500} lineClamp={1}>{log.entityName || 'System'}</Text>
                      <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>{log.entityId}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={1} style={{ minWidth: '250px' }}>
                        {log.details}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={1}>{log.userName || 'Unknown User'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="outline" size="xs" color={log.userRole === 'admin' ? 'red' : 'blue'}>
                        {log.userRole || 'staff'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {totalPages > 1 && <Group justify="flex-end" p="md"><Pagination total={totalPages} value={activePage} onChange={setActivePage} /></Group>}
          </>
        )}
      </Paper>

      {/* Full Details Modal Popup for Complete Administrative Inspection */}
      <Modal 
        opened={!!selectedLog} 
        onClose={() => setSelectedLog(null)} 
        title="Audit Log Full Details"
        centered
        size="lg"
      >
        {selectedLog && (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="xs" fw={700} c="dimmed">ACTION TYPE</Text>
              <Badge color={getActionBadgeColor(selectedLog.actionType)} size="md">
                {selectedLog.actionType}
              </Badge>
            </Group>
            <Divider />

            <Group justify="space-between">
              <Text size="xs" fw={700} c="dimmed">TIME</Text>
              <Text size="sm" ff="monospace">{formatLocalTimestamp(selectedLog.timestamp)}</Text>
            </Group>
            <Divider />

            <Group justify="space-between">
              <Text size="xs" fw={700} c="dimmed">ENTITY NAME</Text>
              <Text size="sm" fw={600}>{selectedLog.entityName || 'N/A'}</Text>
            </Group>
            <Divider />

            <Group justify="space-between">
              <Text size="xs" fw={700} c="dimmed">ENTITY ID / REFERENCE</Text>
              <Text size="xs" ff="monospace" c="indigo" style={{ wordBreak: 'break-all' }}>
                {selectedLog.entityId || 'N/A'}
              </Text>
            </Group>
            <Divider />

            <Group justify="space-between">
              <Text size="xs" fw={700} c="dimmed">PERFORMED BY STAFF</Text>
              <Text size="sm">{selectedLog.userName} ({selectedLog.userRole})</Text>
            </Group>
            <Divider />

            <Box>
              <Text size="xs" fw={700} c="dimmed" mb={4}>FULL OPERATION DETAILS</Text>
              <Card withBorder p="sm" radius="sm" bg="gray.0">
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selectedLog.details || 'No additional details logged.'}
                </Text>
              </Card>
            </Box>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setSelectedLog(null)}>Close Window</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}