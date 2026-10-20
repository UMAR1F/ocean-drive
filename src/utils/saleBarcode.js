import JsBarcode from 'jsbarcode';

export const normalizeSaleScanCode = (saleId) => {
  const raw = String(saleId ?? '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned || raw.toUpperCase().replace(/\s+/g, '');
};

export const renderSaleBarcode = (element, saleId) => {
  if (!element || !saleId) return;
  const scanCode = normalizeSaleScanCode(saleId);
  JsBarcode(element, scanCode, {
    format: 'CODE128',
    displayValue: true,
    fontSize: 16,
    textMargin: 8,
    height: 64,
    margin: 12,
    width: 2,
    lineColor: '#000000',
    background: '#ffffff',
  });
};

export const createSaleBarcodeDataUri = (saleId) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  renderSaleBarcode(svg, saleId);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
};
