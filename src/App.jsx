import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader, Center, AppShell, Burger, Group, Alert, Text, Box } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Login from './components/auth/Login';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import SalesView from './components/sales/SalesView';
import SalesHistoryView from './components/sales/SalesHistoryView';
import SyncStatusPage from './components/dashboard/SyncStatusPage';
import BusinessCalculatorView from './components/calculator/BusinessCalculatorView';
import SystemAssistantView from './components/ai/SystemAssistantView';
import { AuditReportView } from './components/AuditReportView'; 
import { NotificationsView } from './View/NotificationsView'; // <-- 1. Imported Notifications Component

import InventoryManager from './components/inventory/InventoryManager';
import InventoryDashboardPage from './components/inventory/InventoryDashboardPage';
import ProductList from './components/inventory/ProductList';
import CategoriesPage from './components/inventory/CategoriesPage';
import ProcurementPage from './components/inventory/ProcurementPage';
import OfflineStockPage from './components/inventory/OfflineStockPage';

import Dashboard from './components/dashboard/Dashboard';
import UserManagement from './components/auth/UserManagement';
import SettingsHub from './components/settings/StoreSettingsPage';
import PrinterSettings from './components/settings/PrinterSettings';
import eruda from 'eruda';
import { canManageInventory, normalizeRole } from './utils/roles';

function AuthenticatedApp() {
  const { user, currentUser, userRole: contextRole, logout, loading } = useAuth();
  
  const userRole = normalizeRole(currentUser?.role || currentUser?.userRole || contextRole || user?.role);
  const isAdmin = currentUser?.isAdmin || userRole === 'admin';
  const canManageStock = isAdmin || canManageInventory(userRole);

  const [activeTab, setActiveTab] = useState('pos');
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!user && !currentUser) {
    return <Login />;
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <Burger opened={desktopOpened} onClick={toggleDesktop} visibleFrom="sm" size="sm" />
          </Group>
          <div style={{ flex: 1, height: '100%' }}>
            {/* 2. Passed onOpenNotifications prop to Navbar */}
            <Navbar onOpenNotifications={() => setActiveTab('notifications')} />
          </div>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (mobileOpened) toggleMobile();
          }} 
          logout={logout} 
        />
      </AppShell.Navbar>

      <AppShell.Main>
        {activeTab === 'pos' && <SalesView />}
        {activeTab === 'sales-history' && <SalesHistoryView />}
        {activeTab === 'sync-status' && <SyncStatusPage />}
        {activeTab === 'calculator' && <BusinessCalculatorView />}
        {activeTab === 'ai-assistant' && <SystemAssistantView currentUser={currentUser} />}
        
        {/* 3. Added Notifications & Voice Notes route */}
        {activeTab === 'notifications' && <NotificationsView currentUser={currentUser} />}
        
        {activeTab === 'inventory-dashboard' && (
          canManageStock ? <InventoryDashboardPage
            onNavigateToProducts={() => setActiveTab('inventory-products')}
            onNavigateToAdd={() => setActiveTab('inventory-form')}
          /> : <AccessDeniedMessage />
        )}
        {activeTab === 'procurement' && (canManageStock ? <ProcurementPage /> : <AccessDeniedMessage />)}
        {activeTab === 'inventory' && (canManageStock ? <InventoryManager /> : <AccessDeniedMessage />)}
        {activeTab === 'inventory-products' && (canManageStock ? <ProductList /> : <AccessDeniedMessage />)}
        {activeTab === 'inventory-categories' && (canManageStock ? <CategoriesPage /> : <AccessDeniedMessage />)}
        {activeTab === 'offline-stock' && (canManageStock ? <OfflineStockPage /> : <AccessDeniedMessage />)}
        {activeTab === 'inventory-form' && (canManageStock ? <ProductList initialOpenAdd /> : <AccessDeniedMessage />)}
        
        {activeTab === 'settings' && <SettingsHub />}
        {activeTab === 'printer-settings' && <PrinterSettings />}
        
        {activeTab === 'reports' && (
          isAdmin ? <Dashboard /> : <AccessDeniedMessage />
        )}
        {activeTab === 'users' && (
          isAdmin ? <UserManagement /> : <AccessDeniedMessage />
        )}

        {/* --- AUDIT LOGS ROUTE --- */}
        {activeTab === 'audit-logs' && (
          isAdmin ? <AuditReportView /> : <AccessDeniedMessage />
        )}
      </AppShell.Main>
    </AppShell>
  );
}

function AccessDeniedMessage() {
  return (
    <Box p="xl">
      <Alert color="red" title="Access Restricted" variant="light">
        <Text size="sm">You do not have administrative privileges required to access this page.</Text>
      </Alert>
    </Box>
  );
}

export default function App() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      if (!window.erudaInitialized) {
        eruda.init();
        window.erudaInitialized = true;
      }
    } catch (err) {
      console.error("Eruda failed to initialize:", err);
    }
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Center style={{ height: '100vh', fontFamily: 'sans-serif' }}>
        <Loader size="md" />
      </Center>
    );
  }

  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}