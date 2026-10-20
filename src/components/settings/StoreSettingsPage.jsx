// src/components/settings/StoreSettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { 
  Box, Title, Text, Card, TextInput, Textarea, NumberInput, Button, Group, Divider, Loader, FileInput, Alert
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { settingsService } from '../../services/settingsService';
import { cacheManagementService } from '../../services/cacheManagementService';
import { useAuth } from '../../context/AuthContext';

const compressCompanyLogo = file => new Promise((resolve, reject) => {
  if (!file?.type?.startsWith('image/')) {
    reject(new Error('Choose an image file for the company logo.'));
    return;
  }
  if (file.size > 10_000_000) {
    reject(new Error('Choose a logo image smaller than 10 MB.'));
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the selected logo.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not decode the selected logo.'));
    image.onload = () => {
      const scale = Math.min(1, 600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let quality = 0.85;
      let logoDataUrl = canvas.toDataURL('image/jpeg', quality);
      while (logoDataUrl.length > 400_000 && quality > 0.45) {
        quality -= 0.1;
        logoDataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (logoDataUrl.length > 400_000) {
        reject(new Error('The logo could not be compressed enough. Choose a simpler or smaller image.'));
        return;
      }
      resolve(logoDataUrl);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export default function StoreSettingsPage() {
  const { currentUser, user } = useAuth();
  const activeUser = currentUser || user;
  const isAdmin = activeUser?.role === 'admin' || activeUser?.isAdmin || activeUser?.userRole === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingLogo, setProcessingLogo] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    currency: '₦',
    vatRate: 7.5,
    receiptFooter: '',
    companyLogoDataUrl: ''
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getSettings();
      if (data) {
        setFormData({
          businessName: data.businessName || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          taxId: data.taxId || '',
          currency: data.currency || '₦',
          vatRate: Number(data.vatRate) || 0,
          receiptFooter: data.receiptFooter || '',
          companyLogoDataUrl: data.companyLogoDataUrl || ''
        });
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      notifications.show({ title: 'Error', message: 'Could not fetch store settings.', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async file => {
    if (!file) return;
    try {
      setProcessingLogo(true);
      handleChange('companyLogoDataUrl', await compressCompanyLogo(file));
    } catch (err) {
      notifications.show({ title: 'Could not upload logo', message: err.message, color: 'red' });
    } finally {
      setProcessingLogo(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      notifications.show({ title: 'Unauthorized', message: 'Only administrators can save settings.', color: 'red' });
      return;
    }

    try {
      setSaving(true);
      await settingsService.saveSettings(formData, activeUser);
      notifications.show({ title: 'Success', message: 'Store configuration updated successfully.', color: 'teal' });
    } catch (err) {
      console.error("Save settings error:", err);
      notifications.show({ title: 'Error', message: err.message || 'Failed to save settings.', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    const confirmed = window.confirm(
      'Clear cached app data on this device? Pending offline changes will be kept and can still sync later. Cached data will reload the next time you use the app.'
    );
    if (!confirmed) return;

    setClearingCache(true);
    try {
      const result = await cacheManagementService.clearAppCache();
      notifications.show({
        title: 'Cache cleared',
        message: `Cleared ${result.clearedStores} local data stores and ${result.clearedBrowserCaches} browser caches. Pending offline changes were preserved.`,
        color: 'teal',
      });
    } catch (err) {
      console.error('Failed to clear app cache:', err);
      notifications.show({
        title: 'Could not clear cache',
        message: err.message || 'Please try again.',
        color: 'red',
      });
    } finally {
      setClearingCache(false);
    }
  };

  if (loading) {
    return (
      <Box ta="center" py="xl">
        <Loader size="lg" />
        <Text size="sm" c="dimmed" mt="md">Loading configuration profile...</Text>
      </Box>
    );
  }

  return (
    <Box p={{ base: 'xs', md: 'md' }} maw={800} mx="auto">
      <Title order={2} mb={4}>Store & Business Settings</Title>
      <Text size="sm" c="dimmed" mb="lg">Configure your business details, taxes, and receipt footer templates.</Text>

      <form onSubmit={handleSubmit}>
        <Card withBorder radius="md" p="xl">
          <Text fw={600} size="md" mb="md">Business Information</Text>
          <Group grow mb="md">
            <TextInput
              label="Business Name"
              placeholder="e.g. Skylight Ethic Technology"
              value={formData.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
              required
            />
            <TextInput
              label="Phone Number"
              placeholder="e.g. +234 800 000 0000"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
          </Group>

          <Group grow mb="md">
            <TextInput
              label="Email Address"
              placeholder="e.g. support@skylightethic.com"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
            <TextInput
              label="Tax ID / TIN"
              placeholder="e.g. TIN-99887766"
              value={formData.taxId}
              onChange={(e) => handleChange('taxId', e.target.value)}
            />
          </Group>

          <Textarea
            label="Business Address"
            placeholder="Street address, city, state"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
            mb="md"
            autosize
            minRows={2}
          />

          <Group align="flex-end" mb="md" wrap="wrap">
            <FileInput
              label="Company logo"
              placeholder="Choose an image"
              description="PNG, JPEG, or WebP; saved with the business profile"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoUpload}
              disabled={!isAdmin || processingLogo}
              rightSection={processingLogo ? <Loader size="xs" /> : undefined}
              style={{ flex: '1 1 260px' }}
            />
            {formData.companyLogoDataUrl && (
              <>
                <img src={formData.companyLogoDataUrl} alt="Company logo preview" style={{ width: 150, height: 80, objectFit: 'contain', border: '1px solid var(--mantine-color-default-border)', borderRadius: 4, padding: 6 }} />
                <Button variant="default" onClick={() => handleChange('companyLogoDataUrl', '')} disabled={!isAdmin || processingLogo}>Remove logo</Button>
              </>
            )}
          </Group>

          <Divider my="lg" />

          <Text fw={600} size="md" mb="md">Financial & Checkout Configuration</Text>
          <Group grow mb="md">
            <TextInput
              label="Currency Symbol"
              placeholder="₦"
              value={formData.currency}
              onChange={(e) => handleChange('currency', e.target.value)}
              required
            />
            <NumberInput
              label="VAT / Sales Tax Rate (%)"
              placeholder="7.5"
              value={formData.vatRate}
              onChange={(val) => handleChange('vatRate', val)}
              min={0}
              max={100}
              decimalScale={2}
            />
          </Group>

          <Divider my="lg" />

          <Text fw={600} size="md" mb="md">Receipt Customization</Text>
          <Textarea
            label="Receipt Footer Message"
            placeholder="e.g. Goods sold in good condition are not returnable after 7 days."
            value={formData.receiptFooter}
            onChange={(e) => handleChange('receiptFooter', e.target.value)}
            mb="xl"
            autosize
            minRows={3}
          />

          <Group justify="flex-end">
            <Button type="submit" color="blue" loading={saving} disabled={!isAdmin}>
              Save Configurations
            </Button>
          </Group>
        </Card>
      </form>

      <Card withBorder radius="md" p="lg" mt="lg">
        <Text fw={600} size="md" mb="xs">Device Cache</Text>
        <Alert color="yellow" variant="light" mb="md">
          Clears cached app data from this device. Pending offline changes are kept. Cached data will be downloaded again as you use the app.
        </Alert>
        <Group justify="flex-end">
          <Button
            color="red"
            variant="light"
            leftSection={<IconTrash size={16} />}
            onClick={handleClearCache}
            loading={clearingCache}
            disabled={clearingCache}
          >
            Clear All Cache
          </Button>
        </Group>
      </Card>
    </Box>
  );
}