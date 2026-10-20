// src/components/sales/ReceiptModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Modal, Stack, Box, Text, Divider, Group, Button } from '@mantine/core';
import { settingsService } from '../../services/settingsService';
import { printerService } from '../../services/printerService';
import { notifications } from '@mantine/notifications';
import { renderSaleBarcode } from '../../utils/saleBarcode';

export default function ReceiptModal({ opened, onClose, saleData }) {
  const [storeSettings, setStoreSettings] = useState({
    businessName: 'Skylight Ethic POS',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    currency: '₦',
    receiptFooter: 'Thank you for your patronage!',
    companyLogoDataUrl: ''
  });
  const [printing, setPrinting] = useState(false);
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (opened) {
      loadSettings();
    }
  }, [opened]);

  useEffect(() => {
    if (opened && saleData?.id && barcodeRef.current) {
      renderSaleBarcode(barcodeRef.current, saleData.id);
    }
  }, [opened, saleData?.id]);

  const loadSettings = async () => {
    try {
      const data = await settingsService.getSettings();
      if (data) {
        setStoreSettings({
          businessName: data.businessName || 'Skylight Ethic POS',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          taxId: data.taxId || '',
          currency: data.currency || '₦',
          receiptFooter: data.receiptFooter || 'Thank you for your patronage!',
          companyLogoDataUrl: data.companyLogoDataUrl || ''
        });
      }
    } catch (err) {
      console.error("Failed to load store settings for receipt:", err);
    }
  };

  if (!saleData) return null;

  const handlePrintReceipt = async () => {
    setPrinting(true);
    try {
      await printerService.printReceipt(saleData);
      notifications.show({
        title: 'Success',
        message: 'Receipt print job dispatched successfully.',
        color: 'green'
      });
    } catch (err) {
      // Error notifications are handled inside printerService
    } finally {
      setPrinting(false);
    }
  };

  const currencySymbol = storeSettings.currency;

  return (
    <Modal opened={opened} onClose={onClose} title="Transaction Receipt" centered radius="md" size="sm">
      <Stack gap="xs" p="xs">
        {/* Business Header Information */}
        <Box ta="center" mb="sm">
          {storeSettings.companyLogoDataUrl && <img src={storeSettings.companyLogoDataUrl} alt="Company logo" style={{ display: 'block', maxWidth: 150, maxHeight: 64, objectFit: 'contain', margin: '0 auto 8px' }} />}
          <Text fw={700} size="lg">{storeSettings.businessName}</Text>
          {storeSettings.address && <Text size="xs" c="dimmed">{storeSettings.address}</Text>}
          <Group justify="center" gap="xs" mt={2}>
            {storeSettings.phone && <Text size="xs" c="dimmed">Tel: {storeSettings.phone}</Text>}
            {storeSettings.email && <Text size="xs" c="dimmed">• {storeSettings.email}</Text>}
          </Group>
          {storeSettings.taxId && <Text size="xs" c="dimmed">TIN: {storeSettings.taxId}</Text>}
          
          <Divider my="xs" variant="dashed" />
          
          <Text size="xs" fw={500}>Sales Receipt</Text>
          <Text size="xs" c="dimmed">{new Date(saleData.createdAt || Date.now()).toLocaleString()}</Text>
          <Text size="xs" fw={600}>Sale ID: {saleData.id || 'Unavailable'}</Text>
          <Text size="xs">Cashier: {saleData.cashierName || saleData.cashierEmail?.split('@')[0] || 'Staff'}</Text>
          <Text size="xs" c="dimmed">{saleData.cashierEmail || ''}</Text>
        </Box>

        <Divider label="Items" labelPosition="center" />
        
        {saleData.items.map((item, index) => (
          <Group key={index} justify="space-between">
            <Box>
              <Text size="sm">{item.name} (x{item.quantity})</Text>
              {item.barcode && <Text size="xs" c="dimmed">Barcode: {item.barcode}</Text>}
            </Box>
            <Text size="sm" fw={600}>{currencySymbol}{(item.price * item.quantity).toFixed(2)}</Text>
          </Group>
        ))}

        <Divider my="sm" />

        <Group justify="space-between">
          <Text size="sm" fw={600}>Payment Mode:</Text>
          <Text size="sm" tt="uppercase" fw={700} c="blue">{saleData.paymentMethod}</Text>
        </Group>

        <Group justify="space-between">
          <Text size="sm" fw={600}>Subtotal:</Text>
          <Text size="sm">{currencySymbol}{Number(saleData.subtotal || 0).toFixed(2)}</Text>
        </Group>

        {saleData.paymentMethod === 'cash' && (
          <>
            <Group justify="space-between">
              <Text size="sm" fw={600}>Cash Received:</Text>
              <Text size="sm">{currencySymbol}{Number(saleData.cashReceived || 0).toFixed(2)}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={600}>Change:</Text>
              <Text size="sm">{currencySymbol}{Number(saleData.change || 0).toFixed(2)}</Text>
            </Group>
          </>
        )}

        <Divider my="sm" />

        <Group justify="space-between">
          <Text size="md" fw={700}>Total:</Text>
          <Text size="md" fw={700} c="green">{currencySymbol}{Number(saleData.total || 0).toFixed(2)}</Text>
        </Group>

        {saleData.id && (
          <Box ta="center" mt="md">
            <svg ref={barcodeRef} role="img" aria-label={`Barcode for sale ${saleData.id}`} style={{ display: 'block', width: '100%', maxWidth: 360, height: 'auto', margin: '0 auto' }} />
            <Text size="xs" c="dimmed">Scan to find this sale</Text>
          </Box>
        )}

        <Box ta="center" mt="xl">
          <Text size="sm" fw={700} c="dark" style={{ whiteSpace: 'pre-line' }}>{storeSettings.receiptFooter}</Text>
        </Box>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>Close</Button>
          <Button color="blue" onClick={handlePrintReceipt} loading={printing}>Print Receipt</Button>
        </Group>
      </Stack>
    </Modal>
  );
}