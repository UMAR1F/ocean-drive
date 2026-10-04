import React, { useState, useEffect } from 'react';
import { Box, NavLink, Text, rem, useMantineColorScheme, Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { 
  IconShoppingCart, 
  IconHistory, 
  IconPackage, 
  IconCategory, 
  IconPlus, 
  IconDashboard, 
  IconChartBar, 
  IconUsers, 
  IconPrinter, 
  IconBuildingStore,
  IconRefresh,
  IconTruckDelivery,
  IconCalculator,
  IconRobot,
  IconShieldCheck,
  IconDownload, 
  IconLogout,
  IconBell,
  IconDeviceDesktop
} from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { canManageInventory, normalizeRole } from '../../utils/roles';

const getGroupForTab = (tab) => {
  if (['sales-history', 'sync-status', 'notifications'].includes(tab)) return 'operations';
  if (['inventory-dashboard', 'procurement', 'inventory', 'inventory-products', 'inventory-categories', 'offline-stock', 'inventory-form'].includes(tab)) return 'inventory';
  if (['calculator', 'ai-assistant'].includes(tab)) return 'tools';
  if (['reports', 'audit-logs', 'users', 'settings', 'printer-settings'].includes(tab)) return 'admin';
  return null;
};

export default function Sidebar({ activeTab, setActiveTab, logout }) {
  const { user, currentUser, userRole: contextRole } = useAuth();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  // PWA Install state hooks
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(true);
  const [openedGroup, setOpenedGroup] = useState(() => getGroupForTab(activeTab) || 'operations');

  useEffect(() => {
		const activeGroup = getGroupForTab(activeTab);
		if (activeGroup) setOpenedGroup(activeGroup);
	}, [activeTab]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else {
      // Fallback instruction for browsers/environments blocking the native prompt event
      notifications.show({
        title: 'Install Instructions',
        message: 'To install this app, tap your browser menu (three dots) and select "Add to Home Screen" or "Install App".',
        color: 'blue',
        autoClose: 8000,
      });
    }
  };

  const isAdmin = currentUser?.role === 'admin' || currentUser?.isAdmin || contextRole === 'admin';
  const userRole = isAdmin ? 'admin' : normalizeRole(contextRole || currentUser?.role || user?.role);
  const canManageStock = isAdmin || canManageInventory(userRole);

  const renderItem = (label, tab, Icon) => (
    <NavLink
      key={tab}
      label={label}
      active={activeTab === tab}
      onClick={() => setActiveTab(tab)}
      leftSection={<Icon style={{ width: rem(18), height: rem(18) }} />}
      variant="light"
      mb={2}
      radius="sm"
    />
  );

  const renderGroup = (group, label, Icon, children) => (
    <NavLink
      label={label}
      active={getGroupForTab(activeTab) === group}
      opened={openedGroup === group}
      onChange={(opened) => setOpenedGroup(opened ? group : null)}
      leftSection={<Icon style={{ width: rem(18), height: rem(18) }} />}
      variant="light"
      mb={4}
      radius="sm"
    >
      {children}
    </NavLink>
  );

  return (
    <Box p="md" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
      <Box style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
        <Text size="xs" fw={700} c="dimmed" mb="md" tt="uppercase">
          Menu ({userRole})
        </Text>
		{renderItem('POS Terminal', 'pos', IconShoppingCart)}

		{renderGroup('operations', 'Operations', IconHistory, <>
			{renderItem('Sales History', 'sales-history', IconHistory)}
			{renderItem('Sync Status', 'sync-status', IconRefresh)}
			{renderItem('Announcements & Voice', 'notifications', IconBell)}
		</>)}

		{canManageStock && renderGroup('inventory', 'Inventory & Purchasing', IconPackage, <>
			{renderItem('Inventory Dashboard', 'inventory-dashboard', IconDashboard)}
			{renderItem('Inventory Workspace', 'inventory', IconPackage)}
			{renderItem('All Products', 'inventory-products', IconPackage)}
			{renderItem('Add Product', 'inventory-form', IconPlus)}
			{renderItem('Categories', 'inventory-categories', IconCategory)}
			{renderItem('Procurement', 'procurement', IconTruckDelivery)}
			{renderItem('Offline Stock', 'offline-stock', IconDeviceDesktop)}
		</>)}

		{renderGroup('tools', 'Tools & Assistance', IconCalculator, <>
			{renderItem('Business Calculator', 'calculator', IconCalculator)}
			{renderItem('AI System Assistant', 'ai-assistant', IconRobot)}
		</>)}

		{isAdmin && renderGroup('admin', 'Administration', IconBuildingStore, <>
			{renderItem('Reports & Analytics', 'reports', IconChartBar)}
			{renderItem('Audit & Quality Logs', 'audit-logs', IconShieldCheck)}
			{renderItem('User Management', 'users', IconUsers)}
			{renderItem('Store Profile', 'settings', IconBuildingStore)}
			{renderItem('Printer Settings', 'printer-settings', IconPrinter)}
		</>)}
      </Box>

      {/* --- Section 3: Authentication / Sign Out Footer & Conditional Install Button --- */}
      <Box pt="md" style={{ borderTop: `1px solid ${isDark ? 'var(--mantine-color-dark-4)' : '#eee'}` }}>
        {isInstallable && (
          <Button
            fullWidth
            variant="light"
            color="ocean"
            mb="xs"
            leftSection={<IconDownload style={{ width: rem(18), height: rem(18) }} />}
            onClick={handleInstallClick}
            radius="md"
          >
            Install App
          </Button>
        )}
        
        <NavLink
          label="Sign Out"
          color="red"
          onClick={logout}
          leftSection={<IconLogout style={{ width: rem(18), height: rem(18) }} />}
          variant="subtle"
          radius="md"
          style={{ color: 'var(--mantine-color-red-6)' }}
        />
      </Box>
    </Box>
  );
}