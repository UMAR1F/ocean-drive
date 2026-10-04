// src/components/sales/SalesView.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, Grid, Card, Text, TextInput, Button, Group, Stack, 
  Table, NumberInput, Badge, Modal, Select, Alert, Loader, Accordion, Pagination, Chip, Paper, SimpleGrid, useMantineColorScheme
} from '@mantine/core';
import { 
  IconShoppingCart, 
  IconSearch, 
  IconTag, 
  IconPackage, 
  IconTruckDelivery, 
  IconCash, 
  IconBuildingStore, 
  IconTrash, 
  IconPlus, 
  IconMinus, 
  IconReceipt, 
  IconAlertCircle,
  IconRefresh,
  IconBarcode,
  IconCamera,
  IconDeviceDesktop,
  IconX,
  IconBoxSeam
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { salesService } from '../../services/salesService';
import { printerService } from '../../services/printerService';
import { useAuth } from '../../context/AuthContext';
import ReceiptModal from './ReceiptModal';
import { Html5Qrcode } from 'html5-qrcode';

export default function SalesView() {
  const { user, currentUser } = useAuth();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const getUnitPalette = (color) => ({
    backgroundColor: isDark ? 'var(--mantine-color-dark-6)' : {
      ocean: '#e5f0f4',
      orange: '#fff0d8',
      grape: '#eee7f8',
      teal: '#e2f3ef'
    }[color],
    border: `1px solid ${isDark ? `var(--mantine-color-${color}-7)` : {
      ocean: '#6b9bad',
      orange: '#d49a43',
      grape: '#9b7aca',
      teal: '#63a999'
    }[color]}`,
    textColor: isDark ? `${color}.2` : {
      ocean: '#174b5c',
      orange: '#704300',
      grape: '#4c2b73',
      teal: '#175b4d'
    }[color],
    priceColor: isDark ? `${color}.1` : {
      ocean: '#113f4f',
      orange: '#5a3300',
      grape: '#382052',
      teal: '#10483d'
    }[color],
    iconColor: isDark ? `var(--mantine-color-${color}-2)` : {
      ocean: '#195f76',
      orange: '#a45e00',
      grape: '#7044a0',
      teal: '#217c68'
    }[color],
  });
  const piecePalette = getUnitPalette('ocean');
  const wholesalePalette = getUnitPalette('orange');
  const cartonPalette = getUnitPalette('grape');
  const cratePalette = getUnitPalette('teal');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Barcode / Scanner input state for POS quick-add
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannerMode, setScannerMode] = useState('manual'); // 'manual' | 'camera'
  const scannerInstanceRef = useRef(null);
  const isStartingRef = useRef(false);
  const barcodeInputRef = useRef(null);

  // Horizontal chip filter state for prices/unit types on the analysis panel
  const [selectedPriceFilter, setSelectedPriceFilter] = useState('All');

  // Per-category pagination state: { [categoryName]: pageNumber }
  const [categoryPages, setCategoryPages] = useState({});
  const itemsPerPage = 24;

  const [cart, setCart] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Checkout Modal State
  const [checkoutOpened, { open: openCheckout, close: closeCheckout }] = useDisclosure(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState(0);
  const [processing, setProcessing] = useState(false);
  const transactionInProgressRef = useRef(false);

  // Receipt Modal State
  const [receiptOpened, { open: openReceipt, close: closeReceipt }] = useDisclosure(false);
  const [completedSaleData, setCompletedSaleData] = useState(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    loadProducts();
  }, []);

  // Camera scanner effect for POS Quick Scan
  useEffect(() => {
    let isMounted = true;

    if (scannerMode === 'camera' && !scannerInstanceRef.current && !isStartingRef.current) {
      isStartingRef.current = true;
      const scannerId = 'pos-inline-reader';
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerInstanceRef.current = html5QrCode;

      html5QrCode.start(
        { facingMode: 'environment' },
        { 
          fps: 10, 
          qrbox: { width: 250, height: 100 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          if (isMounted) {
            handleBarcodeScanned(decodedText);
            stopCamera();
          }
        },
        (errorMessage) => {
          // Suppress continuous frame scanning parsing warnings
        }
      )
      .then(() => {
        isStartingRef.current = false;
      })
      .catch((err) => {
        console.error("Failed to start POS camera feed:", err);
        isStartingRef.current = false;
        if (isMounted) setScannerMode('manual');
      });
    }

    return () => {
      isMounted = false;
      if (scannerInstanceRef.current) {
        try {
          if (scannerInstanceRef.current.isScanning) {
            scannerInstanceRef.current.stop().then(() => {
              scannerInstanceRef.current.clear();
              scannerInstanceRef.current = null;
            }).catch((error) => {
              if (error?.name !== 'AbortError') {
                console.error("Error stopping POS scanner cleanup:", error);
              }
            });
          } else {
            scannerInstanceRef.current.clear();
            scannerInstanceRef.current = null;
          }
        } catch (e) {
          scannerInstanceRef.current = null;
        }
      }
    };
  }, [scannerMode, products]);

  const stopCamera = () => {
    if (scannerInstanceRef.current) {
      try {
        if (scannerInstanceRef.current.isScanning) {
          scannerInstanceRef.current.stop().then(() => {
            scannerInstanceRef.current?.clear();
            scannerInstanceRef.current = null;
            setScannerMode('manual');
          }).catch(err => {
            console.error("Failed to cleanly stop camera", err);
            scannerInstanceRef.current = null;
            setScannerMode('manual');
          });
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    scannerInstanceRef.current = null;
    setScannerMode('manual');
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await salesService.getPOSProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("SalesView: Failed to load products:", err);
      setError(err.message || 'Failed to load products');
      notifications.show({ title: 'Error', message: 'Failed to load products', color: 'red' });
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = (code) => {
    if (!code) return;
    const cleanCode = code.trim().toLowerCase();
    const matchedProduct = products.find(p => 
      (p.barcode && p.barcode.toLowerCase() === cleanCode) || 
      (p.sku && p.sku.toLowerCase() === cleanCode)
    );

    if (matchedProduct) {
      handleProductClick(matchedProduct, 'piece');
      notifications.show({ title: 'Scanned', message: `Added ${matchedProduct.name}`, color: 'green', autoClose: 1500 });
      setBarcodeInput('');
    } else {
      notifications.show({ title: 'Not Found', message: `No product matches code: ${code}`, color: 'orange' });
    }
  };

  const handleProductClick = (product, unitType = 'piece') => {
    const currentStock = Number(product.stock || 0);
    if (currentStock <= 0) {
      notifications.show({ title: 'Out of Stock', message: `${product.name} is out of stock.`, color: 'orange' });
      return;
    }

    let unitPrice = product.price || product.sellingPrice || 0;
    let piecesPerUnit = 1;

    if (unitType === 'wholesale') {
      unitPrice = Number(product.wholesalePrice || unitPrice);
    } else if (unitType === 'carton') {
      unitPrice = Number(product.pricePerCarton || 0);
      piecesPerUnit = Number(product.piecesPerCarton || 1);
    } else if (unitType === 'crate') {
      unitPrice = Number(product.pricePerCrate || 0);
      piecesPerUnit = Number(product.piecesPerCrate || 1);
    }

    if (currentStock < piecesPerUnit) {
      notifications.show({ title: 'Insufficient Stock', message: `Not enough stock available for ${unitType}.`, color: 'orange' });
      return;
    }

    setCart(prevCart => {
      const reservedUnits = prevCart
        .filter(item => item.id === product.id)
        .reduce((sum, item) => sum + item.quantity * (item.piecesPerUnit || 1), 0);

      if (reservedUnits + piecesPerUnit > currentStock) {
        notifications.show({ title: 'Limit Reached', message: 'Cannot exceed available stock level.', color: 'orange' });
        return prevCart;
      }

      const existingIndex = prevCart.findIndex(item => item.id === product.id && item.selectedUnitType === unitType);
      
      if (existingIndex > -1) {
        const updated = [...prevCart];
        updated[existingIndex] = { ...updated[existingIndex], quantity: updated[existingIndex].quantity + 1 };
        return updated;
      }

      return [...prevCart, {
        ...product,
        selectedUnitType: unitType,
        selectedPrice: unitPrice,
        piecesPerUnit,
        quantity: 1
      }];
    });
  };

  const updateQuantity = (id, unitType, delta) => {
    setCart(prevCart => {
      return prevCart.map(item => {
        if (item.id === id && item.selectedUnitType === unitType) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;

          const piecesPerUnit = item.piecesPerUnit || 1;
          const totalRequiredStock = prevCart
            .filter(cartItem => cartItem.id === id)
            .reduce((sum, cartItem) => {
              const quantity = cartItem.selectedUnitType === unitType ? newQty : cartItem.quantity;
              return sum + quantity * (cartItem.piecesPerUnit || 1);
            }, 0);

          if (totalRequiredStock > Number(item.stock || 0)) {
            notifications.show({ title: 'Stock Limit', message: 'Not enough stock available.', color: 'orange' });
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean);
    });
  };

  const removeFromCart = (id, unitType) => {
    setCart(prev => prev.filter(item => !(item.id === id && item.selectedUnitType === unitType)));
  };

  const filteredCart = cart.filter(item => {
    if (selectedPriceFilter === 'All') return true;
    const unitType = (item.selectedUnitType || '').toLowerCase();
    return unitType === selectedPriceFilter.toLowerCase();
  });

  const subtotal = cart.reduce((sum, item) => {
    const itemPrice = item.selectedPrice !== undefined ? item.selectedPrice : (item.price || item.sellingPrice || 0);
    return sum + (itemPrice * item.quantity);
  }, 0);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const changeAmount = cashReceived - subtotal;

  const handleOpenCheckout = () => {
    if (cart.length === 0) return;
    setCashReceived(subtotal);
    openCheckout();
  };

  const handleCompleteTransaction = async () => {
    if (transactionInProgressRef.current) return;
    if (paymentMethod === 'cash' && Number(cashReceived) < subtotal) {
      notifications.show({ title: 'Insufficient Cash', message: 'Cash received must cover the total amount due.', color: 'red' });
      return;
    }

    transactionInProgressRef.current = true;
    const autoPrint = printerService.getConfig().autoPrint;
    const printWindow = autoPrint ? window.open('', '_blank', 'width=400,height=600') : null;
    setProcessing(true);
    try {
      const result = await salesService.completeSale(
        cart, 
        { 
          method: paymentMethod, 
          cashReceived, 
          change: changeAmount 
        }, 
        currentUser || user
      );

      notifications.show({
        title: result.offline ? 'Sale Saved Offline!' : 'Sale Successful!',
        message: `Transaction completed. Total: ₦${result.total.toFixed(2)}${result.offline ? ' (Will sync when online)' : ''}`,
        color: result.offline ? 'yellow' : 'green'
      });

      if (autoPrint && printWindow) {
        try {
          await printerService.printReceipt(result.saleData, printWindow);
        } catch (printError) {
          console.error('Automatic receipt printing failed:', printError);
        }
      } else if (autoPrint) {
        notifications.show({
          title: 'Automatic printing blocked',
          message: 'Allow popups for this site, or print from the receipt window.',
          color: 'orange'
        });
      }

      setCompletedSaleData(result.saleData);
      setCart([]);
      setSelectedPriceFilter('All');
      closeCheckout();
      openReceipt();
      loadProducts(); 
    } catch (err) {
      printWindow?.close();
      notifications.show({
        title: 'Checkout Failed',
        message: err.message || 'Could not complete transaction',
        color: 'red'
      });
    } finally {
      transactionInProgressRef.current = false;
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.isActive !== false && (
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const productsByCategory = filteredProducts.reduce((acc, product) => {
    const cat = 
      product.categoryName || 
      product.category_name || 
      (typeof product.category === 'string' ? product.category : null) || 
      product.category?.name || 
      product.category?.title || 
      'Uncategorized';

    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(product);
    return acc;
  }, {});

  const categoryNames = Object.keys(productsByCategory);

  const handlePageChange = (category, page) => {
    setCategoryPages(prev => ({ ...prev, [category]: page }));
  };

  return (
    <Box p={{ base: 'xs', md: 'md' }} className="sales-page">
      {!isOnline && (
        <Alert icon={<IconAlertCircle size={16} />} title="Offline Mode Active" color="yellow" mb="md" variant="light">
          You are currently offline. Sales will be recorded locally and synchronized automatically once network connectivity is restored.
        </Alert>
      )}

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Error Loading Catalog" color="red" mb="md" variant="light">
          {error} <Button leftSection={<IconRefresh size={14} />} variant="subtle" size="xs" onClick={loadProducts} ml="md">Retry</Button>
        </Alert>
      )}

      {/* Improved Desktop Fluid Grid Layout */}
      <Grid gutter="md" align="stretch">
        {/* Left Side: Product Catalog Accordion Grouped by Category */}
        <Grid.Col span={{ base: 12, md: 7, lg: 8 }}>
          <Card 
            className="sales-panel sales-catalog-panel"
            withBorder 
            shadow="sm" 
            radius="md" 
            p="md" 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: 'calc(100vh - 110px)',
              minHeight: '650px' 
            }}
          >
            <Group justify="space-between" mb="md" wrap="wrap" className="sales-panel-heading">
              <Group gap="xs">
                <IconBuildingStore size={22} color={`var(--mantine-color-ocean-${isDark ? 2 : 7})`} />
                <Text fw={700} size="lg">POS Terminal Catalog</Text>
              </Group>
              <TextInput
                placeholder="Search by name, SKU or barcode..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '260px' }}
              />
            </Group>

            {/* Quick Barcode Scanner Bar */}
            <Box mb="md" className="sales-scanner-bar">
              <Group justify="space-between" align="center" mb={4}>
                <Group gap={6}>
                  <Text size="xs" fw={500}>Quick Barcode Scanner</Text>
                  {scannerMode === 'manual' && (
                    <Badge size="xs" variant="light" color="ocean" leftSection={<IconDeviceDesktop size={10} />}>
                      Hardware Ready
                    </Badge>
                  )}
                </Group>
                {scannerMode === 'manual' ? (
                  <Button 
                    size="compact-xs" 
                    variant="light" 
                    color="teal"
                    leftSection={<IconCamera size={12} />}
                    onClick={() => setScannerMode('camera')}
                  >
                    Use Mobile Camera
                  </Button>
                ) : (
                  <Button 
                    size="compact-xs" 
                    color="red" 
                    variant="light" 
                    leftSection={<IconX size={12} />}
                    onClick={stopCamera}
                  >
                    Close Camera
                  </Button>
                )}
              </Group>

              {scannerMode === 'manual' ? (
                <TextInput
                  ref={barcodeInputRef}
                  placeholder="Click & scan with hardware scanner, or type barcode..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleBarcodeScanned(barcodeInput);
                    }
                  }}
                  leftSection={<IconBarcode size={16} />}
                  rightSection={
                    <Button 
                      size="compact-xs" 
                      variant="subtle" 
                      onClick={() => handleBarcodeScanned(barcodeInput)}
                    >
                      Add
                    </Button>
                  }
                />
              ) : (
                <Paper withBorder p="xs" radius="md" bg={isDark ? 'dark.9' : 'gray.1'} className="sales-scanner-preview">
                  <Text size="xs" c="dimmed" ta="center" mb={4}>
                    Align product barcode within frame:
                  </Text>
                  <div id="pos-inline-reader" style={{ width: '100%', minHeight: '140px' }}></div>
                </Paper>
              )}
            </Box>

            {/* Catalog Accordion Area */}
            <Box style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {loading ? (
                <Box ta="center" py="xl"><Loader /></Box>
              ) : categoryNames.length === 0 ? (
                <Box ta="center" py="xl">
                  <Text c="dimmed" mb="sm">No products found in inventory or local cache.</Text>
                  <Button variant="light" size="xs" leftSection={<IconRefresh size={14} />} onClick={loadProducts}>Refresh Catalog</Button>
                </Box>
              ) : (
                <Accordion defaultValue={categoryNames} multiple variant="contained">
                  {categoryNames.map(category => {
                    const catProducts = productsByCategory[category];
                    const currentPage = categoryPages[category] || 1;
                    const totalPages = Math.ceil(catProducts.length / itemsPerPage) || 1;
                    const paginatedCatProducts = catProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

                    return (
                      <Accordion.Item key={category} value={category}>
                        <Accordion.Control>
                          <Group justify="space-between" pr="md">
                            <Text fw={600}>{category}</Text>
                            <Badge variant="light" size="sm">{catProducts.length} items</Badge>
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          {/* Expanded 4-Column Grid for Desktop View */}
                          <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} spacing="xs" mb="md">
                            {paginatedCatProducts.map(product => {
                              const stockCount = Number(product.stock || 0);
                              const outOfStock = stockCount <= 0;
                              const unitPrice = product.price || product.sellingPrice || 0;
                              const wholesalePrice = Number(product.wholesalePrice || 0);
                              const uom = product.uom || 'Piece';
                              const hasCarton = product.hasCarton && Number(product.piecesPerCarton) > 0;
                              const hasCrate = product.hasCrate && Number(product.piecesPerCrate) > 0;

                              return (
                                <Card 
                                  key={product.id}
                                  className="sales-product-card"
                                  withBorder 
                                  padding="xs" 
                                  radius="md" 
                                  style={{ 
                                    opacity: outOfStock ? 0.6 : 1,
                                    backgroundColor: isDark
                                      ? 'var(--mantine-color-dark-7)'
                                      : (outOfStock ? 'var(--mantine-color-gray-0)' : 'var(--mantine-color-white)'),
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                  }}
                                >
                                  <div>
                                    <Group justify="space-between" mb={4} wrap="nowrap">
                                      <Text fw={600} size="xs" truncate style={{ flex: 1 }}>{product.name}</Text>
                                      <Badge size="xs" color={outOfStock ? 'red' : 'green'} variant="light">
                                        {outOfStock ? 'Out' : `${stockCount}`}
                                      </Badge>
                                    </Group>

                                    <Stack gap={4} mt={6}>
                                      <div
                                        onClick={() => !outOfStock && handleProductClick(product, 'piece')}
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          padding: '4px 8px',
                                          backgroundColor: piecePalette.backgroundColor,
                                          borderRadius: '4px',
                                          cursor: outOfStock ? 'not-allowed' : 'pointer',
                                          border: piecePalette.border
                                        }}
                                      >
                                        <Group gap={4}>
                                          <IconPackage size={12} color={piecePalette.iconColor} />
                                          <Text size="10px" fw={500} c={piecePalette.textColor} tt="uppercase">{uom}</Text>
                                        </Group>
                                        <Text size="xs" fw={700} c={piecePalette.priceColor}>₦{Number(unitPrice).toFixed(2)}</Text>
                                      </div>

                                      {wholesalePrice > 0 && (
                                        <div
                                          onClick={() => !outOfStock && handleProductClick(product, 'wholesale')}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '4px 8px',
                                            backgroundColor: wholesalePalette.backgroundColor,
                                            borderRadius: '4px',
                                            cursor: outOfStock ? 'not-allowed' : 'pointer',
                                            border: wholesalePalette.border
                                          }}
                                        >
                                          <Group gap={4}>
                                            <IconTruckDelivery size={12} color={wholesalePalette.iconColor} />
                                            <Text size="10px" fw={500} c={wholesalePalette.textColor}>W/Sale</Text>
                                          </Group>
                                          <Text size="xs" fw={700} c={wholesalePalette.priceColor}>₦{wholesalePrice.toFixed(2)}</Text>
                                        </div>
                                      )}

                                      {hasCarton && (
                                        <div
                                          onClick={() => !outOfStock && handleProductClick(product, 'carton')}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '4px 8px',
                                            backgroundColor: cartonPalette.backgroundColor,
                                            borderRadius: '4px',
                                            cursor: outOfStock ? 'not-allowed' : 'pointer',
                                            border: cartonPalette.border
                                          }}
                                        >
                                          <Group gap={4}>
                                            <IconBoxSeam size={12} color={cartonPalette.iconColor} />
                                            <Text size="10px" fw={500} c={cartonPalette.textColor}>Carton</Text>
                                          </Group>
                                          <Text size="xs" fw={700} c={cartonPalette.priceColor}>₦{Number(product.pricePerCarton || 0).toFixed(2)}</Text>
                                        </div>
                                      )}

                                      {hasCrate && (
                                        <div
                                          onClick={() => !outOfStock && handleProductClick(product, 'crate')}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '4px 8px',
                                            backgroundColor: cratePalette.backgroundColor,
                                            borderRadius: '4px',
                                            cursor: outOfStock ? 'not-allowed' : 'pointer',
                                            border: cratePalette.border
                                          }}
                                        >
                                          <Group gap={4}>
                                            <IconBoxSeam size={12} color={cratePalette.iconColor} />
                                            <Text size="10px" fw={500} c={cratePalette.textColor}>Crate</Text>
                                          </Group>
                                          <Text size="xs" fw={700} c={cratePalette.priceColor}>₦{Number(product.pricePerCrate || 0).toFixed(2)}</Text>
                                        </div>
                                      )}
                                    </Stack>
                                  </div>
                                </Card>
                              );
                            })}
                          </SimpleGrid>

                          {totalPages > 1 && (
                            <Group justify="center" mt="sm">
                              <Pagination 
                                total={totalPages} 
                                value={currentPage} 
                                onChange={(page) => handlePageChange(category, page)} 
                                size="sm" 
                              />
                            </Group>
                          )}
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  })}
                </Accordion>
              )}
            </Box>
          </Card>
        </Grid.Col>

        {/* Right Side: Current Sale Analysis with Horizontal Price/Unit Chip List */}
        <Grid.Col span={{ base: 12, md: 5, lg: 4 }}>
          <Card 
            className="sales-panel sales-cart-panel"
            withBorder 
            shadow="sm" 
            radius="md" 
            p="md" 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: 'calc(100vh - 110px)',
              minHeight: '650px' 
            }}
          >
            <Group justify="space-between" mb="sm" className="sales-panel-heading">
              <Group gap="xs">
                <IconShoppingCart size={20} color={`var(--mantine-color-ocean-${isDark ? 2 : 7})`} />
                <Text fw={700} size="lg">Current Sale Analysis</Text>
              </Group>
              <Badge leftSection={<IconTag size={12} />}>{totalItems} items</Badge>
            </Group>

            {/* Horizontal Price / Unit Filter Chip List */}
            <Box mb="md" style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: '4px' }}>
              <Chip.Group multiple={false} value={selectedPriceFilter} onChange={setSelectedPriceFilter}>
                <Group gap="xs" wrap="nowrap">
                  <Chip value="All" size="sm" variant="outline">All Prices</Chip>
                  <Chip value="piece" size="sm" variant="outline">Retail / Piece</Chip>
                  <Chip value="wholesale" size="sm" variant="outline">Wholesale</Chip>
                  <Chip value="carton" size="sm" variant="outline">Carton</Chip>
                  <Chip value="crate" size="sm" variant="outline">Crate</Chip>
                </Group>
              </Chip.Group>
            </Box>

            {/* Cart Items List */}
            <Box style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
              {filteredCart.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">No items match the selected price filter.</Text>
              ) : (
                <Table verticalSpacing="xs">
                  <Table.Tbody>
                    {filteredCart.map(item => {
                      const unitPrice = item.selectedPrice !== undefined ? item.selectedPrice : (item.price || item.sellingPrice || 0);
                      const displayUnit = item.selectedUnitType || item.uom || 'Piece';
                      return (
                        <Table.Tr key={`${item.id}-${item.selectedUnitType}`}>
                          <Table.Td>
                            <Text size="sm" fw={500}>{item.name}</Text>
                            <Group gap={6}>
                              <Badge size="xs" variant="outline" tt="uppercase">{displayUnit}</Badge>
                              <Text size="xs" c="dimmed">₦{unitPrice} / {displayUnit}</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td align="right" width={130}>
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <Button size="compact-xs" variant="light" onClick={() => updateQuantity(item.id, item.selectedUnitType, -1)}><IconMinus size={12} /></Button>
                              <Text size="sm" fw={600} style={{ width: '20px', textAlign: 'center' }}>{item.quantity}</Text>
                              <Button size="compact-xs" variant="light" onClick={() => updateQuantity(item.id, item.selectedUnitType, 1)}><IconPlus size={12} /></Button>
                              <Button size="compact-xs" color="red" variant="subtle" onClick={() => removeFromCart(item.id, item.selectedUnitType)}><IconTrash size={12} /></Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              )}
            </Box>

            {/* Subtotal & Checkout Action */}
            <Box pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
              <Group justify="space-between" mb="xs">
                <Text size="md" fw={600}>Subtotal:</Text>
                <Text size="lg" fw={700}>₦{subtotal.toFixed(2)}</Text>
              </Group>

              <Button 
                fullWidth 
                color="ocean" 
                size="md" 
                leftSection={<IconCash size={18} />}
                disabled={cart.length === 0}
                onClick={handleOpenCheckout}
              >
                Proceed to Checkout (₦{subtotal.toFixed(2)})
              </Button>
            </Box>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Checkout Modal */}
      <Modal opened={checkoutOpened} onClose={closeCheckout} title="Complete Transaction" centered>
        <Stack gap="md">
          <Box p="md" bg={isDark ? 'dark.6' : 'gray.0'} style={{ borderRadius: '8px' }}>
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed">Total Items:</Text>
              <Text size="sm" fw={600}>{totalItems}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="lg" fw={700}>Total Amount Due:</Text>
              <Text size="xl" fw={700} c={isDark ? 'ocean.2' : 'ocean.7'}>₦{subtotal.toFixed(2)}</Text>
            </Group>
          </Box>

          <Select
            label="Payment Method"
            data={[
              { value: 'cash', label: 'Cash' },
              { value: 'transfer', label: 'Bank Transfer' },
              { value: 'pos', label: 'POS Terminal' }
            ]}
            value={paymentMethod}
            onChange={(val) => setPaymentMethod(val || 'cash')}
          />

          {paymentMethod === 'cash' && (
            <>
              <NumberInput
                label="Cash Received (₦)"
                value={cashReceived}
                onChange={(val) => setCashReceived(Number(val) || 0)}
                min={0}
                decimalScale={2}
                fixedDecimalScale
              />
              <Group justify="space-between">
                <Text fw={600}>Change Due:</Text>
                <Text fw={700} c={changeAmount < 0 ? 'red' : 'green'}>
                  ₦{changeAmount.toFixed(2)}
                </Text>
              </Group>
            </>
          )}

          <Button 
            fullWidth 
            color="green" 
            size="md" 
            loading={processing}
            onClick={handleCompleteTransaction}
          >
            Confirm & Print Receipt
          </Button>
        </Stack>
      </Modal>

      {/* Receipt Modal */}
      <ReceiptModal 
        opened={receiptOpened} 
        onClose={closeReceipt} 
        saleData={completedSaleData} 
      />
    </Box>
  );
}