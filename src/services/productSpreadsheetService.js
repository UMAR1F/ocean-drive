import ExcelJS from 'exceljs';

const PRODUCT_COLUMNS = [
  ['Product ID', 'id'],
  ['Product Name', 'name'],
  ['SKU', 'sku'],
  ['Barcode', 'barcode'],
  ['Category ID', 'categoryId'],
  ['Category', 'categoryName'],
  ['Cost Price', 'costPrice'],
  ['Selling Price', 'sellingPrice'],
  ['Legacy Price', 'price'],
  ['Wholesale Price', 'wholesalePrice'],
  ['Stock', 'stock'],
  ['Opening Stock', 'openingStock'],
  ['Reorder Point', 'reorderPoint'],
  ['Minimum Stock Alert', 'minStockAlert'],
  ['Unit', 'uom'],
  ['Items Per Pack', 'itemsPerPack'],
  ['Location', 'location'],
  ['Supplier Name', 'supplierName'],
  ['Active', 'isActive'],
  ['Entry Mode', 'entryMode'],
  ['Has Carton', 'hasCarton'],
  ['Pieces Per Carton', 'piecesPerCarton'],
  ['Price Per Carton', 'pricePerCarton'],
  ['Has Crate', 'hasCrate'],
  ['Pieces Per Crate', 'piecesPerCrate'],
  ['Price Per Crate', 'pricePerCrate'],
  ['Last Stock Adjustment At', 'lastStockAdjustmentAt'],
  ['Last Stock Adjustment Quantity', 'lastStockAdjustmentQuantity'],
  ['Last Stock Adjustment Cost Price', 'lastStockAdjustmentCostPrice'],
  ['Offline Reserved Units (read-only)', 'offlineReservedUnits'],
  ['Created At (read-only)', 'createdAt'],
  ['Updated At (read-only)', 'updatedAt'],
];

const normalizeHeader = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADER_ALIASES = {
  id: ['id', 'productid'],
  name: ['name', 'product', 'productname', 'item', 'itemname'],
  sku: ['sku', 'stockkeepingunit'],
  barcode: ['barcode', 'barcodevalue'],
  categoryId: ['categoryid'],
  categoryName: ['category', 'categoryname'],
  costPrice: ['cost', 'costprice', 'buyingprice', 'purchaseprice'],
  sellingPrice: ['sellingprice', 'sellprice', 'price'],
  price: ['legacyprice'],
  wholesalePrice: ['wholesaleprice'],
  stock: ['stock', 'quantity', 'currentstock'],
  openingStock: ['openingstock'],
  reorderPoint: ['reorderpoint', 'minstockalert', 'lowstockalert'],
  minStockAlert: ['minimumstockalert', 'minstockalertvalue'],
  uom: ['unit', 'uom', 'unitofmeasure'],
  itemsPerPack: ['itemsperpack'],
  location: ['location'],
  supplierName: ['supplier', 'suppliername'],
  isActive: ['active', 'isactive'],
  entryMode: ['entrymode'],
  hasCarton: ['hascarton'],
  piecesPerCarton: ['piecespercarton'],
  pricePerCarton: ['pricepercarton'],
  hasCrate: ['hascrate'],
  piecesPerCrate: ['piecespercrate'],
  pricePerCrate: ['pricepercrate'],
  lastStockAdjustmentAt: ['laststockadjustmentat'],
  lastStockAdjustmentQuantity: ['laststockadjustmentquantity'],
  lastStockAdjustmentCostPrice: ['laststockadjustmentcostprice'],
};

const parseNumber = (value, field, fallback) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return number;
};

const parseBoolean = (value, field, fallback) => {
  if (value === '' || value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', '1', 'active'].includes(normalized)) return true;
  if (['false', 'no', '0', 'inactive'].includes(normalized)) return false;
  throw new Error(`${field} must be Yes or No.`);
};

const getColumnIndexes = (headers) => {
  const normalizedHeaders = headers.map(normalizeHeader);
  const indexes = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    indexes[field] = normalizedHeaders.findIndex((header) => aliases.includes(header));
  }

  if (indexes.name === -1) {
    throw new Error('The spreadsheet must include a Product Name or Name column.');
  }
  return indexes;
};

const readCell = (row, indexes, field) => {
  const index = indexes[field];
  return index < 0 ? '' : row[index] ?? '';
};

const isProvided = (value) => value !== '' && value !== null && value !== undefined;

const parseProductRow = (row, indexes, rowNumber) => {
  try {
    const name = String(readCell(row, indexes, 'name')).trim();
    if (!name) throw new Error('Product Name is required.');

    const entryMode = String(readCell(row, indexes, 'entryMode') || 'wholesale').trim().toLowerCase();
    if (!['wholesale', 'general'].includes(entryMode)) {
      throw new Error('Entry Mode must be Wholesale or General.');
    }

    const sellingPrice = parseNumber(readCell(row, indexes, 'sellingPrice'), 'Selling Price', 0);
    const categoryName = String(readCell(row, indexes, 'categoryName')).trim();
    const providedFields = Object.keys(indexes).filter((field) => {
      const value = readCell(row, indexes, field);
      return indexes[field] >= 0 && isProvided(value);
    });
    const lastStockAdjustmentAt = readCell(row, indexes, 'lastStockAdjustmentAt');
    const parsedAdjustmentAt = lastStockAdjustmentAt
      ? new Date(lastStockAdjustmentAt).toISOString()
      : '';

    return {
      rowNumber,
      id: String(readCell(row, indexes, 'id')).trim(),
      providedFields,
      product: {
        name,
        sku: String(readCell(row, indexes, 'sku')).trim(),
        barcode: String(readCell(row, indexes, 'barcode')).trim(),
        categoryId: String(readCell(row, indexes, 'categoryId')).trim(),
        categoryName,
        costPrice: parseNumber(readCell(row, indexes, 'costPrice'), 'Cost Price', 0),
        sellingPrice,
        price: parseNumber(readCell(row, indexes, 'price'), 'Legacy Price', null),
        wholesalePrice: parseNumber(readCell(row, indexes, 'wholesalePrice'), 'Wholesale Price', sellingPrice),
        stock: parseNumber(readCell(row, indexes, 'stock'), 'Stock', 0),
        openingStock: parseNumber(readCell(row, indexes, 'openingStock'), 'Opening Stock', null),
        reorderPoint: parseNumber(readCell(row, indexes, 'reorderPoint'), 'Reorder Point', 5),
        minStockAlert: parseNumber(readCell(row, indexes, 'minStockAlert'), 'Minimum Stock Alert', null),
        uom: String(readCell(row, indexes, 'uom') || 'Pieces').trim(),
        itemsPerPack: parseNumber(readCell(row, indexes, 'itemsPerPack'), 'Items Per Pack', 1) || 1,
        location: String(readCell(row, indexes, 'location')).trim(),
        supplierName: String(readCell(row, indexes, 'supplierName')).trim(),
        isActive: parseBoolean(readCell(row, indexes, 'isActive'), 'Active', true),
        entryMode,
        hasCarton: parseBoolean(readCell(row, indexes, 'hasCarton'), 'Has Carton', false),
        piecesPerCarton: parseNumber(readCell(row, indexes, 'piecesPerCarton'), 'Pieces Per Carton', null),
        pricePerCarton: parseNumber(readCell(row, indexes, 'pricePerCarton'), 'Price Per Carton', null),
        hasCrate: parseBoolean(readCell(row, indexes, 'hasCrate'), 'Has Crate', false),
        piecesPerCrate: parseNumber(readCell(row, indexes, 'piecesPerCrate'), 'Pieces Per Crate', null),
        pricePerCrate: parseNumber(readCell(row, indexes, 'pricePerCrate'), 'Price Per Crate', null),
        lastStockAdjustmentAt: parsedAdjustmentAt,
        lastStockAdjustmentQuantity: parseNumber(readCell(row, indexes, 'lastStockAdjustmentQuantity'), 'Last Stock Adjustment Quantity', null),
        lastStockAdjustmentCostPrice: parseNumber(readCell(row, indexes, 'lastStockAdjustmentCostPrice'), 'Last Stock Adjustment Cost Price', null),
      },
    };
  } catch (error) {
    return { rowNumber, error: error.message };
  }
};

const parseCsvRows = (csv) => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n' || character === '\r') {
      row.push(value);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
};

const getWorksheetRows = (worksheet) => {
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values.slice(1).map((value) => {
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
        if ('result' in value) return value.result ?? '';
        if ('text' in value) return value.text ?? '';
      }
      return value ?? '';
    });
    rows.push(values);
  });
  return rows;
};

const parseProductRows = (rows) => {
  if (rows.length < 2) throw new Error('The spreadsheet has no product rows.');
  const indexes = getColumnIndexes(rows[0]);
  return rows.slice(1)
    .map((row, index) => parseProductRow(row, indexes, index + 2))
    .filter(({ product, error }) => product || error);
};

const createWorkbook = (products) => {
  const rows = products.map((product) => PRODUCT_COLUMNS.map(([, key]) => {
    if (key === 'categoryName') return product.categoryName || product.category || '';
    if (key === 'sellingPrice') return product.sellingPrice ?? product.price ?? '';
    if (key === 'isActive') return product.isActive === false ? 'No' : 'Yes';
    if (key === 'hasCarton' || key === 'hasCrate') return product[key] ? 'Yes' : 'No';
    if (key === 'createdAt' || key === 'updatedAt' || key === 'lastStockAdjustmentAt') {
      const date = product[key]?.toDate ? product[key].toDate() : product[key];
      return date ? new Date(date).toISOString() : '';
    }
    return product[key] ?? '';
  }));
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Products');
  worksheet.addRow(PRODUCT_COLUMNS.map(([header]) => header));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.columns = PRODUCT_COLUMNS.map(([header]) => ({
    width: Math.max(header.length + 2, 16),
  }));
  return workbook;
};

const downloadWorkbook = async (workbook, fileName, title) => {
  const content = await workbook.xlsx.writeBuffer();
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([content], { type: mimeType });
  const file = new File([blob], fileName, { type: mimeType });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return { aborted: false };
    } catch (error) {
      if (error.name === 'AbortError') return { aborted: true };
      console.warn('Could not share the product spreadsheet; falling back to download:', error);
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { aborted: false };
};

export const exportProductsToSpreadsheet = async (products) => {
  const fileName = `Products_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const workbook = createWorkbook(products);
  return downloadWorkbook(workbook, fileName, 'Products');
};

export const downloadProductImportTemplate = async () => {
  const workbook = createWorkbook([]);
  return downloadWorkbook(workbook, 'Product_Import_Template.xlsx', 'Product Import Template');
};

export const readProductsFromSpreadsheet = async (file) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    const csv = (await file.text()).replace(/^\uFEFF/, '');
    return parseProductRows(parseCsvRows(csv));
  }
  if (extension === 'xls') {
    const XLSX = await import('xlsx');
    const legacyWorkbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheetName = legacyWorkbook.SheetNames[0];
    if (!sheetName) throw new Error('The selected spreadsheet has no worksheets.');
    const rows = XLSX.utils.sheet_to_json(legacyWorkbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      blankrows: false,
    });
    return parseProductRows(rows);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('The selected spreadsheet has no worksheets.');
  return parseProductRows(getWorksheetRows(worksheet));
};
