// src/components/sales/SalesView.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Grid, Card, Text, TextInput, Button, Group, Stack,
  Table, NumberInput, Badge, Modal, Select, Alert, Loader, Accordion, Pagination, Paper, SimpleGrid, useMantineColorScheme
} from '@mantine/core';
import { 
  IconShoppingCart, 
  IconSearch, 
  IconPackage, 
  IconTruckDelivery, 
  IconCash, 
  IconBuildingStore, 
  IconTrash, 
  IconPlus, 
  IconMinus, 
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
  const [products, setProducts] = useState([]);
  const productsRef = useRef(products);
  productsRef.current = products;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Barcode / Scanner input state for POS quick-add
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannerMode, setScannerMode] = useState('manual'); // 'manual' | 'camera'
  const [scannerError, setScannerError] = useState('');
  const scannerInstanceRef = useRef(null);
  const barcodeInputRef = useRef(null);

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
    let html5QrCode = null;

    if (scannerMode === 'camera') {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setScannerError('Camera scanning requires HTTPS (or localhost) and camera access in your browser.');
        setScannerMode('manual');
        return undefined;
      }
    }

    if (scannerMode === 'camera' && !scannerInstanceRef.current) {
      const scannerId = 'pos-inline-reader';
      html5QrCode = new Html5Qrcode(scannerId);
      scannerInstanceRef.current = html5QrCode;

      const startScanner = async () => {
        try {
          await new Promise((resolve) => window.requestAnimationFrame(resolve));
          if (!isMounted) return;
          await html5QrCode.start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: (width, height) => ({
                width: Math.min(Math.floor(width * 0.85), 320),
                height: Math.min(Math.floor(height * 0.35), 180)
              }),
              aspectRatio: 1.0
            },
            (decodedText) => {
              if (isMounted) {
                handleBarcodeScanned(decodedText);
                stopCamera();
              }
            },
            () => {}
          );
          if (!isMounted) {
            await html5QrCode.stop();
            html5QrCode.clear();
            return;
          }
          setScannerError('');
        } catch (err) {
          console.error('Failed to start POS camera feed:', err);
          if (isMounted) {
            const message = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
              ? 'Camera permission was denied. Allow camera access in your browser settings, then try again.'
              : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
                ? 'No camera was found on this device.'
                : 'Could not start the camera. Check camera permissions and close other apps using the camera.';
            setScannerError(message);
            setScannerMode('manual');
          }
          if (scannerInstanceRef.current === html5QrCode) {
            try {
              html5QrCode.clear();
            } catch (cleanupError) {
              console.error('Failed to clear POS camera scanner:', cleanupError);
            }
            scannerInstanceRef.current = null;
          }
        }
      };

      startScanner();
    }

    return () => {
      isMounted = false;
      if (scannerInstanceRef.current) {
        const scanner = scannerInstanceRef.current;
        scannerInstanceRef.current = null;
        if (scanner.isScanning) {
          scanner.stop().then(() => scanner.clear()).catch((err) => {
            if (err?.name !== 'AbortError') {
              console.error('Error stopping POS scanner cleanup:', err);
            }
          });
        } else {
          try {
            scanner.clear();
          } catch (err) {
            console.error('Error clearing POS scanner cleanup:', err);
          }
        }
      }
    };
  }, [scannerMode]);

  const stopCamera = () => {
    if (scannerInstanceRef.current) {
      const scanner = scannerInstanceRef.current;
      scannerInstanceRef.current = null;
      if (scanner.isScanning) {
        scanner.stop().then(() => scanner.clear()).catch(err => {
          console.error('Failed to cleanly stop camera', err);
        }).finally(() => setScannerMode('manual'));
      } else {
        try {
          scanner.clear();
        } catch (err) {
          console.error('Failed to clear camera scanner', err);
        }
        setScannerMode('manual');
      }
      return;
    }
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
    const matchedProduct = productsRef.current.find(p =>
      (p.barcode && p.barcode.toLowerCase() === cleanCode) ||
      (p.sku && p.sku.toLowerCase() === cleanCode)
    );

    if (matchedProduct) {
      handleProductClick(matchedProduct, matchedProduct.entryMode === 'wholesale' ? 'wholesale' : 'piece');
      notifications.show({ title: 'Scanned', message: `Added ${matchedProduct.name}`, color: 'green', autoClose: 1500 });
      setBarcodeInput('');
      setScannerError('');
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

  const setCartQuantity = (id, unitType, quantity) => {
    setCart(prevCart => {
      const currentItem = prevCart.find(item => item.id === id && item.selectedUnitType === unitType);
      if (!currentItem || !Number.isInteger(quantity) || quantity < 0) return prevCart;
      if (quantity === 0) return prevCart.filter(item => !(item.id === id && item.selectedUnitType === unitType));

      const totalRequiredStock = prevCart
        .filter(item => item.id === id)
        .reduce((sum, item) => {
          const itemQuantity = item.selectedUnitType === unitType ? quantity : item.quantity;
          return sum + itemQuantity * (item.piecesPerUnit || 1);
        }, 0);
      if (totalRequiredStock > Number(currentItem.stock || 0)) {
        notifications.show({ title: 'Stock Limit', message: 'Not enough stock available.', color: 'orange' });
        return prevCart;
      }
      return prevCart.map(item => (
        item.id === id && item.selectedUnitType === unitType ? { ...item, quantity } : item
      ));
    });
  };

  const updateQuantity = (id, unitType, delta) => {
    const item = cart.find(cartItem => cartItem.id === id && cartItem.selectedUnitType === unitType);
    if (item) setCartQuantity(id, unitType, item.quantity + delta);
  };

  const removeFromCart = (id, unitType) => {
    setCart(prev => prev.filter(item => !(item.id === id && item.selectedUnitType === unitType)));
  };

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
            <Group justify="space-between" mb="sm" wrap="wrap" className="sales-panel-heading">
              <Group gap="xs">
                <IconBuildingStore size={20} color={`var(--mantine-color-ocean-${isDark ? 2 : 7})`} />
                <Text fw={600} size="md">Product catalog</Text>
              </Group>
              <TextInput
                size="sm"
                placeholder="Search products, SKU or barcode"
                leftSection={<IconSearch size={18} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 'min(100%, 320px)' }}
              />
            </Group>

            {/* Quick Barcode Scanner Bar */}
            <Box mb="sm" className="sales-scanner-bar">
              <Group justify="space-between" align="center" mb={6}>
                <Group gap="xs">
                  <Text size="sm" fw={600}>Scan a product</Text>
                  {scannerMode === 'manual' && (
                    <Badge size="xs" variant="light" color="ocean" leftSection={<IconDeviceDesktop size={10} />}>
                      Scanner ready
                    </Badge>
                  )}
                </Group>
                {scannerMode === 'manual' ? (
                  <Button
                    size="sm"
                    variant="light"
                    color="teal"
                    leftSection={<IconCamera size={16} />}
                    onClick={() => {
                      setScannerError('');
                      setScannerMode('camera');
                    }}
                  >
                    Scan with camera
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    color="red"
                    variant="light"
                    leftSection={<IconX size={16} />}
                    onClick={stopCamera}
                  >
                    Close camera
                  </Button>
                )}
              </Group>

              {scannerError && <Alert color="red" variant="light" mb="xs" title="Camera unavailable">{scannerError}</Alert>}

              {scannerMode === 'manual' ? (
                <TextInput
                  ref={barcodeInputRef}
                  size="sm"
                  placeholder="Scan a barcode or enter it here"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleBarcodeScanned(barcodeInput);
                    }
                  }}
                  leftSection={<IconBarcode size={18} />}
                  rightSection={
                    <Button
                      size="sm"
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
                    Point the rear camera at the barcode
                  </Text>
                  <div id="pos-inline-reader" style={{ width: '100%', minHeight: '220px' }}></div>
                </Paper>
              )}
            </Box>

            {/* Catalog Accordion Area */}
            <Box style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {loading ? (
                <Box ta="center" py="xl"><Loader /></Box>
              ) : categoryNames.length === 0 ? (
                <Box ta="center" py="xl">
                  <Text size="md" c="dimmed" mb="sm">No products found in inventory or local cache.</Text>
                  <Button variant="light" size="sm" leftSection={<IconRefresh size={16} />} onClick={loadProducts}>Refresh catalog</Button>
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
                          <Group justify="space-between" pr="sm">
                            <Text fw={600} size="sm">{category}</Text>
                            <Badge variant="light" size="sm">{catProducts.length} items</Badge>
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          {/* Expanded 4-Column Grid for Desktop View */}
                          <SimpleGrid cols={{ base: 1, sm: 2, md: 2, xl: 4 }} spacing="xs" mb="sm">
                            {paginatedCatProducts.map(product => {
                              const stockCount = Number(product.stock || 0);
                              const outOfStock = stockCount <= 0;
                              const unitPrice = product.price || product.sellingPrice || 0;
                              const wholesalePrice = Number(product.wholesalePrice || 0);
                              const uom = product.uom || 'Piece';
                              const isWholesale = product.entryMode === 'wholesale';
                              const primaryUnitType = isWholesale ? 'wholesale' : 'piece';
                              const primaryPrice = isWholesale ? Number(wholesalePrice || unitPrice) : Number(unitPrice);
                              const hasCarton = product.hasCarton && Number(product.piecesPerCarton) > 0;
                              const hasCrate = product.hasCrate && Number(product.piecesPerCrate) > 0;

                              return (
                                <Card 
                                  key={product.id}
                                  className="sales-product-card"
                                  withBorder 
                                  padding="sm"
                                  radius="sm"
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
                                    <Stack gap={4} mb="xs">
                                      <Text
                                        className="sales-product-name"
                                        fw={600}
                                        size="sm"
                                        title={product.name}
                                      >
                                        {product.name}
                                      </Text>
                                      <Badge
                                        className="sales-product-stock"
                                        size="xs"
                                        color={outOfStock ? 'red' : 'green'}
                                        variant="light"
                                      >
                                        {outOfStock ? 'Out of stock' : `${stockCount} ${uom} available`}
                                      </Badge>
                                    </Stack>

                                    <Stack gap={6}>
                                      <Button
                                        className="sales-unit-button"
                                        fullWidth
                                        size="sm"
                                        variant="light"
                                        color={isWholesale ? 'orange' : 'ocean'}
                                        disabled={outOfStock}
                                        onClick={() => handleProductClick(product, primaryUnitType)}
                                      >
                                        <div className="sales-unit-button-content">
                                          <Group className="sales-unit-button-label" gap={4} wrap="nowrap">
                                            {isWholesale ? <IconTruckDelivery size={18} /> : <IconPackage size={18} />}
                                            <Text size="sm" fw={600}>{isWholesale ? 'Price' : uom}</Text>
                                          </Group>
                                          <Text className="sales-unit-button-price" size="xs" fw={700}>₦{primaryPrice.toFixed(2)}</Text>
                                        </div>
                                      </Button>

                                      {hasCarton && (
                                        <Button
                                          className="sales-unit-button"
                                          fullWidth
                                          size="xs"
                                          variant="light"
                                          color="grape"
                                          disabled={outOfStock}
                                          onClick={() => handleProductClick(product, 'carton')}
                                        >
                                          <div className="sales-unit-button-content">
                                            <Group className="sales-unit-button-label" gap={4} wrap="nowrap">
                                              <IconBoxSeam size={16} />
                                              <Text size="xs" fw={500}>Carton</Text>
                                            </Group>
                                            <Text className="sales-unit-button-price" size="xs" fw={600}>₦{Number(product.pricePerCarton || 0).toFixed(2)}</Text>
                                          </div>
                                        </Button>
                                      )}

                                      {hasCrate && (
                                        <Button
                                          className="sales-unit-button"
                                          fullWidth
                                          size="xs"
                                          variant="light"
                                          color="teal"
                                          disabled={outOfStock}
                                          onClick={() => handleProductClick(product, 'crate')}
                                        >
                                          <div className="sales-unit-button-content">
                                            <Group className="sales-unit-button-label" gap={4} wrap="nowrap">
                                              <IconBoxSeam size={16} />
                                              <Text size="xs" fw={500}>Crate</Text>
                                            </Group>
                                            <Text className="sales-unit-button-price" size="xs" fw={600}>₦{Number(product.pricePerCrate || 0).toFixed(2)}</Text>
                                          </div>
                                        </Button>
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

        {/* Current sale cart */}
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
            <Group justify="space-between" mb="xs" className="sales-panel-heading">
              <Group gap="xs">
                <IconShoppingCart size={18} color={`var(--mantine-color-ocean-${isDark ? 2 : 7})`} />
                <Text fw={600} size="md">Sale cart</Text>
              </Group>
              <Badge size="sm">{totalItems} items</Badge>
            </Group>

            {/* Cart Items List */}
            <Box style={{ flex: 1, overflowY: 'auto', marginBottom: '0.5rem' }}>
              {cart.length === 0 ? (
                <Stack align="center" justify="center" py="lg" gap={4}>
                  <IconShoppingCart size={28} color="var(--mantine-color-gray-5)" />
                  <Text size="sm" fw={500} ta="center">Your cart is empty</Text>
                  <Text size="xs" c="dimmed" ta="center">Scan a barcode or tap a product to add it.</Text>
                </Stack>
              ) : (
                <Table verticalSpacing="xs">
                  <Table.Tbody>
                    {cart.map(item => {
                      const unitPrice = item.selectedPrice !== undefined ? item.selectedPrice : (item.price || item.sellingPrice || 0);
                      const displayUnit = item.selectedUnitType === 'wholesale'
                        ? 'Wholesale'
                        : item.selectedUnitType || item.uom || 'Piece';
                      const otherReservedUnits = cart
                        .filter(cartItem => cartItem.id === item.id && cartItem.selectedUnitType !== item.selectedUnitType)
                        .reduce((sum, cartItem) => sum + cartItem.quantity * (cartItem.piecesPerUnit || 1), 0);
                      const maxQuantity = Math.floor(
                        (Number(item.stock || 0) - otherReservedUnits) / (item.piecesPerUnit || 1)
                      );
                      return (
                        <Table.Tr key={`${item.id}-${item.selectedUnitType}`}>
                          <Table.Td>
                            <Text size="sm" fw={500}>{item.name}</Text>
                            <Group gap={6} mt={2}>
                              <Badge size="xs" variant="light">{displayUnit}</Badge>
                              <Text size="xs" fw={500}>₦{Number(unitPrice).toFixed(2)} each</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td align="right" width={170}>
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <Button size="compact-sm" variant="light" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.id, item.selectedUnitType, -1)}><IconMinus size={14} /></Button>
                              <NumberInput
                                aria-label={`Quantity of ${item.name}`}
                                value={item.quantity}
                                onChange={(value) => {
                                  if (value !== '' && Number.isInteger(Number(value)) && Number(value) >= 1) {
                                    setCartQuantity(item.id, item.selectedUnitType, Number(value));
                                  }
                                }}
                                min={1}
                                max={maxQuantity}
                                allowDecimal={false}
                                size="sm"
                                w={76}
                              />
                              <Button size="compact-sm" variant="light" aria-label={`Increase ${item.name} quantity`} onClick={() => updateQuantity(item.id, item.selectedUnitType, 1)}><IconPlus size={14} /></Button>
                              <Button size="compact-sm" color="red" variant="subtle" aria-label={`Remove ${item.name}`} onClick={() => removeFromCart(item.id, item.selectedUnitType)}><IconTrash size={14} /></Button>
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
            <Box pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
              <Group justify="space-between" mb={6}>
                <Text size="sm" fw={500}>Subtotal:</Text>
                <Text size="md" fw={600}>₦{subtotal.toFixed(2)}</Text>
              </Group>

              <Button 
                fullWidth 
                color="ocean" 
                size="sm"
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