// src/services/printerService.js
import { notifications } from '@mantine/notifications';
import { settingsService } from './settingsService';

const PRINTER_CONFIG_KEY = 'skylight_printer_config';

export const printerService = {
  getConfig() {
    try {
      const saved = localStorage.getItem(PRINTER_CONFIG_KEY);
      if (saved) {
        return {
          printerWidth: '88mm',
          connectionType: 'browser',
          networkIp: '',
          autoPrint: true,
          ...JSON.parse(saved)
        };
      }
    } catch (e) {
      console.error("Failed to parse printer settings", e);
    }
    return {
      printerWidth: '88mm',
      connectionType: 'usb',
      networkIp: '',
      autoPrint: true
    };
  },

  saveConfig(config) {
    localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
  },

  async printReceipt(saleData, preparedWindow = null) {
    const config = this.getConfig();
    const paperWidth = config.printerWidth === '50mm' ? 50 : 88;
    const contentWidth = config.printerWidth === '50mm' ? 48 : 80;

    // Fetch dynamic store settings for the receipt template
    let storeSettings = {
      businessName: 'Skylight Ethic POS',
      address: '',
      phone: '',
      email: '',
      taxId: '',
      currency: '₦',
      receiptFooter: 'Thank you for your patronage!'
    };

    try {
      const fetchedSettings = await settingsService.getSettings();
      if (fetchedSettings) {
        storeSettings = { ...storeSettings, ...fetchedSettings };
      }
    } catch (err) {
      console.warn("Could not load latest store settings for print, using defaults:", err);
    }

    const currencySymbol = storeSettings.currency || '₦';

    try {
      const printWindow = preparedWindow || window.open('', '_blank', 'width=400,height=600');
      if (!printWindow) {
        throw new Error('Popup blocked. Please allow popups to print receipts.');
      }

      const receiptHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt - ${storeSettings.businessName}</title>
            <style>
              @page { margin: 0; }
              html, body { margin: 0; padding: 0; }
              body {
                font-family: 'Courier New', Courier, monospace;
                font-size: 12px;
                color: #000;
                box-sizing: border-box;
                width: ${contentWidth}mm;
                margin: 0 auto;
                padding: 1.5mm;
              }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .flex { display: flex; justify-content: space-between; }
              .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
              table { width: 100%; border-collapse: collapse; }
              th, td { font-size: 12px; text-align: left; padding: 2px 0; }
              td.right, th.right { text-align: right; }
            </style>
          </head>
          <body>
            ${storeSettings.companyLogoDataUrl ? `<img src="${storeSettings.companyLogoDataUrl}" alt="Company logo" style="display:block;max-width:40mm;max-height:18mm;object-fit:contain;margin:0 auto 2mm;">` : ''}
            <div class="center bold" style="font-size: 14px;">${storeSettings.businessName}</div>
            ${storeSettings.address ? `<div class="center" style="font-size: 10px;">${storeSettings.address}</div>` : ''}
            <div class="center" style="font-size: 10px;">
              ${storeSettings.phone ? `Tel: ${storeSettings.phone}` : ''} 
              ${storeSettings.phone && storeSettings.email ? '•' : ''} 
              ${storeSettings.email ? storeSettings.email : ''}
            </div>
            ${storeSettings.taxId ? `<div class="center" style="font-size: 10px;">TIN: ${storeSettings.taxId}</div>` : ''}
            
            <div class="divider"></div>
            
            <div class="center" style="font-size: 11px; font-weight: bold;">Sales Receipt</div>
            <div class="center" style="font-size: 10px; margin-bottom: 5px;">${new Date(saleData.createdAt || Date.now()).toLocaleString()}</div>
            
            <div class="divider"></div>
            
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="center">Qty</th>
                  <th class="right">Price</th>
                </tr>
              </thead>
              <tbody>
                ${saleData.items.map(item => `
                  <tr>
                    <td>${item.name}</td>
                    <td class="center">${item.quantity}</td>
                    <td class="right">${currencySymbol}${(item.price * item.quantity).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="divider"></div>
            
            <div class="flex">
              <span>Payment Mode:</span>
              <span class="bold">${saleData.paymentMethod?.toUpperCase()}</span>
            </div>
            <div class="flex">
              <span>Subtotal:</span>
              <span>${currencySymbol}${Number(saleData.subtotal || 0).toFixed(2)}</span>
            </div>
            ${saleData.paymentMethod === 'cash' ? `
              <div class="flex">
                <span>Cash Received:</span>
                <span>${currencySymbol}${Number(saleData.cashReceived || 0).toFixed(2)}</span>
              </div>
              <div class="flex">
                <span>Change:</span>
                <span>${currencySymbol}${Number(saleData.change || 0).toFixed(2)}</span>
              </div>
            ` : ''}
            
            <div class="divider"></div>
            
            <div class="flex bold" style="font-size: 14px;">
              <span>Total:</span>
              <span>${currencySymbol}${Number(saleData.total || 0).toFixed(2)}</span>
            </div>
            
            <div class="divider"></div>
            <div class="center" style="margin-top: 10px; font-size: 10px; white-space: pre-line;">
              ${storeSettings.receiptFooter}
            </div>
          </body>
        </html>
      `;

      printWindow.document.write(receiptHtml);
      printWindow.document.close();
      printWindow.focus();

      await new Promise(resolve => printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(resolve)));
      const pageHeight = Math.max(40, (printWindow.document.body.scrollHeight / 96) * 25.4 + 2);
      const pageStyle = printWindow.document.createElement('style');
      pageStyle.textContent = `@page { size: ${paperWidth}mm ${pageHeight.toFixed(2)}mm; margin: 0; }`;
      printWindow.document.head.appendChild(pageStyle);
      printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
      printWindow.print();

      return { success: true };
    } catch (err) {
      preparedWindow?.close();
      console.error("Printer service error:", err);
      notifications.show({
        title: 'Printing Error',
        message: err.message || 'Failed to dispatch job to printer.',
        color: 'red'
      });
      throw err;
    }
  }
};