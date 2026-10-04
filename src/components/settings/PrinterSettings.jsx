// src/components/settings/PrinterSettings.jsx
import React, { useState, useEffect } from 'react';
import { Card, Text, Select, Button, Group, Stack, Switch, Divider, Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { printerService } from '../../services/printerService';

export default function PrinterSettings() {
  const [printerWidth, setPrinterWidth] = useState('88mm');
  const [autoPrint, setAutoPrint] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const config = printerService.getConfig();
    setPrinterWidth(config.printerWidth);
    setAutoPrint(config.autoPrint);
  }, []);

  const handleSave = () => {
    printerService.saveConfig({ printerWidth, autoPrint });
    notifications.show({
      title: 'Settings Saved',
      message: 'Printer configuration updated successfully.',
      color: 'green'
    });
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      const dummySale = {
        createdAt: new Date().toISOString(),
        items: [{ name: 'Test Sample Product', quantity: 1, price: 100 }],
        subtotal: 100,
        total: 100,
        paymentMethod: 'cash',
        cashReceived: 100,
        change: 0
      };

      await printerService.printReceipt(dummySale);
      notifications.show({
        title: 'Test Print Sent',
        message: 'The browser print dialog has been opened.',
        color: 'blue'
      });
    } catch (err) {
      // Handled inside printerService notification
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card withBorder shadow="sm" radius="md" p="lg" maw={600} mx="auto">
      <Text fw={700} size="lg" mb="md">Thermal Receipt Printer Configuration</Text>
      <Text size="sm" c="dimmed" mb="xl">
        Configure paper roll dimensions and hardware connection mode (USB, Bluetooth, or Wireless Network) for POS receipts.
      </Text>

      <Stack gap="md">
        <Select
          label="Receipt Paper Width"
          description="Select standard thermal paper width format"
          value={printerWidth}
          onChange={(val) => setPrinterWidth(val || '88mm')}
          data={[
            { value: '88mm', label: '88mm (Standard Wide Roll)' },
            { value: '50mm', label: '50mm (Compact Mobile Roll)' }
          ]}
        />

        <Alert color="blue" variant="light" title="Printer connection">
          Receipts use the browser print dialog and your device's configured printer. USB, Bluetooth, or network routing must be configured in the operating system or printer driver.
        </Alert>

        <Switch
          label="Auto-print receipt upon checkout completion"
          checked={autoPrint}
          onChange={(e) => setAutoPrint(e.currentTarget.checked)}
          mt="xs"
        />

        <Divider my="sm" />

        <Group justify="flex-end">
          <Button variant="default" onClick={handleTestPrint} loading={testing}>
            Test Print
          </Button>
          <Button color="blue" onClick={handleSave}>
            Save Printer Settings
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}