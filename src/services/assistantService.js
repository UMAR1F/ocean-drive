import { productService } from './productService';
import { salesService } from './salesService';

const SYSTEM_GUIDE = [
  'POS and checkout: search the catalog, scan barcodes, add retail or bulk units to a cart, take payment, and print receipts.',
  'Inventory: manage products, categories, prices, stock levels, low-stock thresholds, and stock adjustments.',
  'Sales history and reports: review completed sales; administrators can access system-wide reports and staff management.',
  'Offline and sync: local IndexedDB storage and a pending-operation queue keep supported workflows available during network interruptions.',
  'Announcements: administrators can broadcast notices; staff can read and play them with text-to-speech.',
  'Settings: administrators can configure store details and printer options.',
].join('\n');

const formatCurrency = (amount) => `₦${Number(amount || 0).toLocaleString('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const getSaleDate = (sale) => {
  const createdAt = sale.createdAt;
  if (createdAt?.toDate) return createdAt.toDate();
  const parsedDate = new Date(createdAt || 0);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const filterSalesByPeriod = (sales, query) => {
  const now = new Date();
  let startDate = null;

  if (query.includes('today')) {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (query.includes('this week') || query.includes('this month')) {
    const daysSinceMonday = (now.getDay() + 6) % 7;
    startDate = query.includes('this week')
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday)
      : new Date(now.getFullYear(), now.getMonth(), 1);
  }

  if (!startDate) return sales;
  return sales.filter((sale) => {
    const saleDate = getSaleDate(sale);
    return saleDate && saleDate >= startDate && saleDate <= now;
  });
};

const summarizeSales = (sales) => {
  const completedSales = sales.filter((sale) => sale.status !== 'returned');
  const revenue = completedSales.reduce((total, sale) => total + Number(sale.total || 0), 0);
  const quantities = new Map();

  completedSales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      const name = item.name || 'Unnamed product';
      quantities.set(name, (quantities.get(name) || 0) + Number(item.quantity || 0));
    });
  });

  const topProducts = [...quantities.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 5);

  return { completedSales, revenue, topProducts };
};

const summarizeInventory = (products) => {
  const activeProducts = products.filter((product) => product.isActive !== false);
  const outOfStock = activeProducts.filter((product) => Number(product.stock || 0) <= 0);
  const lowStock = activeProducts.filter((product) => {
    const stock = Number(product.stock || 0);
    const threshold = Number(product.minStockAlert ?? product.reorderPoint ?? 5);
    return stock > 0 && stock <= threshold;
  });

  return { activeProducts, outOfStock, lowStock };
};

export const assistantService = {
  async ask(question, currentUser) {
    const query = String(question || '').trim().toLowerCase();
    if (!query) return 'Ask me about sales, products, stock, or how a system feature works.';

    const asksSales = /\b(sales?|sold|revenue|transactions?|top[- ]selling|best[- ]selling|popular)\b/.test(query);
    const asksInventory = /\b(inventory|stock|products?|catalog|categories|category|barcode|sku|price|pricing|low stock|out of stock)\b/.test(query);
    const asksSystem = /\b(system|module|feature|services?|how does|how do|offline|sync|settings|printer|announcement|role|admin|security|pos|checkout|receipt|architecture|stack|technology|tech)\b/.test(query);
    const asksTopProducts = /\b(top|best|popular|most)\b/.test(query);

    if (asksSales) {
      if (!currentUser?.uid && !currentUser?.id && !currentUser?.email) {
        return 'Sign in to view sales information for your account.';
      }

      const sales = await salesService.getSalesHistory(currentUser);
      const periodSales = filterSalesByPeriod(sales, query);
      const summary = summarizeSales(periodSales);
      const period = query.includes('today') ? 'today' : query.includes('this week') ? 'this week' : query.includes('this month') ? 'this month' : 'available history';

      if (summary.completedSales.length === 0) {
        return `There are no completed sales in your account's ${period}.`;
      }

      const lines = [
        `Sales in your account's ${period}: ${summary.completedSales.length} completed transactions.`,
        `Recorded revenue: ${formatCurrency(summary.revenue)}.`,
      ];
      if (asksTopProducts && summary.topProducts.length > 0) {
        lines.push('Top products by recorded quantity:');
        summary.topProducts.forEach(([name, quantity], index) => {
          lines.push(`${index + 1}. ${name}: ${quantity} sold`);
        });
      }
      return lines.join('\n');
    }

    if (asksInventory) {
      const products = await productService.getAllProducts();
      const inventory = summarizeInventory(products);
      const namedProduct = inventory.activeProducts.find((product) => {
        const name = String(product.name || '').trim().toLowerCase();
        return name.length > 2 && query.includes(name);
      });

      if (namedProduct) {
        return [
          `${namedProduct.name} (${namedProduct.categoryName || 'Uncategorized'})`,
          `Stock: ${Number(namedProduct.stock || 0)} ${namedProduct.uom || 'units'}.`,
          `Selling price: ${formatCurrency(namedProduct.sellingPrice || namedProduct.price)}.`,
          `Wholesale price: ${formatCurrency(namedProduct.wholesalePrice)}.`,
        ].join('\n');
      }

      if (/\b(low stock|out of stock|reorder)\b/.test(query)) {
        const matchingProducts = /\bout of stock\b/.test(query) ? inventory.outOfStock : inventory.lowStock;
        if (matchingProducts.length === 0) return 'No matching low-stock products were found in the available inventory.';
        return matchingProducts.slice(0, 10).map((product) => (
          `${product.name}: ${Number(product.stock || 0)} in stock (reorder threshold ${Number(product.minStockAlert ?? product.reorderPoint ?? 5)}).`
        )).join('\n');
      }

      const categoryCount = new Set(inventory.activeProducts.map((product) => product.categoryName).filter(Boolean)).size;
      return [
        `Available inventory: ${inventory.activeProducts.length} active products across ${categoryCount} categories.`,
        `${inventory.lowStock.length} products are low in stock; ${inventory.outOfStock.length} are out of stock.`,
      ].join('\n');
    }

    if (asksSystem) {
      if (/\b(offline|sync)\b/.test(query)) {
        return SYSTEM_GUIDE.split('\n').find((line) => line.startsWith('Offline and sync:'));
      }
      if (/\b(admin|role|security)\b/.test(query)) {
        return 'The app reads each signed-in user\'s role from the users collection. Admin-only screens are gated in the UI; Firestore Security Rules must also enforce these permissions on the database.';
      }
      if (/\b(architecture|stack|technology|tech)\b/.test(query)) {
        return 'The app uses React and Vite for the interface, Mantine for UI components, Firebase Authentication and Firestore for account/data services, and IndexedDB-backed local storage for offline workflows.';
      }
      if (/\b(what can|modules|features|services|system)\b/.test(query)) {
        return `Here is what the current app supports:\n${SYSTEM_GUIDE}`;
      }
      const matchingGuide = SYSTEM_GUIDE.split('\n').find((line) => {
        const topic = line.split(':')[0].toLowerCase();
        return query.split(/\s+/).some((word) => word.length > 3 && topic.includes(word));
      });
      return matchingGuide || `I can explain the current system modules:\n${SYSTEM_GUIDE}`;
    }

    return 'I can answer from available sales and inventory records, or explain the POS, inventory, offline sync, announcements, settings, and user roles. Try asking about today\'s sales, a product\'s stock, or a system feature.';
  },
};