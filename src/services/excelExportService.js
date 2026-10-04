import ExcelJS from 'exceljs';

const columnName = (index) => {
  let name = '';
  let current = index + 1;
  while (current) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
};

export const exportReportToExcel = async ({
  title,
  subtitle,
  fileName,
  sheetName,
  columns,
  rows,
  summary = []
}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('There is no data to export.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Skylight POS';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.views = [{ state: 'frozen', ySplit: 5 }];

  const worksheet = workbook.addWorksheet(sheetName || 'Report', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  const lastColumn = columns.length;
  const lastColumnName = columnName(lastColumn - 1);

  worksheet.mergeCells(`A1:${lastColumnName}1`);
  worksheet.getCell('A1').value = title;
  worksheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16434A' } };
  worksheet.getCell('A1').alignment = { vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  worksheet.mergeCells(`A2:${lastColumnName}2`);
  worksheet.getCell('A2').value = subtitle;
  worksheet.getCell('A2').font = { name: 'Aptos', size: 11, color: { argb: 'FF31545A' } };
  worksheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F1' } };
  worksheet.getRow(2).height = 21;

  worksheet.mergeCells(`A3:${lastColumnName}3`);
  worksheet.getCell('A3').value = `Generated ${new Date().toLocaleString()}  |  ${rows.length} records`;
  worksheet.getCell('A3').font = { name: 'Aptos', size: 9, italic: true, color: { argb: 'FF586E72' } };
  worksheet.getRow(3).height = 18;
  worksheet.getRow(4).height = 8;

  const headerRow = worksheet.getRow(5);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF247B78' } };
    cell.alignment = { vertical: 'middle', horizontal: column.alignment || 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF16434A' } } };
    worksheet.getColumn(index + 1).width = column.width || 18;
  });
  headerRow.height = 26;

  rows.forEach((record, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 6);
    columns.forEach((column, columnIndex) => {
      const value = typeof column.value === 'function' ? column.value(record) : record[column.key];
      const cell = row.getCell(columnIndex + 1);
      cell.value = value ?? '';
      cell.alignment = { vertical: 'top', horizontal: column.alignment || 'left', wrapText: true };
      if (column.numFmt) cell.numFmt = column.numFmt;
      if (rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7F6' } };
      }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD8E1DF' } } };
    });
    row.height = 20;
  });

  worksheet.autoFilter = {
    from: 'A5',
    to: `${lastColumnName}${rows.length + 5}`
  };

  if (summary.length) {
    let summaryRowIndex = rows.length + 7;
    summary.forEach((item) => {
      worksheet.getCell(`A${summaryRowIndex}`).value = item.label;
      worksheet.getCell(`A${summaryRowIndex}`).font = { bold: true, color: { argb: 'FF16434A' } };
      worksheet.getCell(`B${summaryRowIndex}`).value = item.value;
      worksheet.getCell(`B${summaryRowIndex}`).font = { bold: true };
      if (item.numFmt) worksheet.getCell(`B${summaryRowIndex}`).numFmt = item.numFmt;
      summaryRowIndex += 1;
    });
  }

  worksheet.pageSetup.printTitlesRow = '1:5';
  worksheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };

  const content = await workbook.xlsx.writeBuffer();
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([content], { type: mimeType });
  const exportFile = new File([blob], fileName, { type: mimeType });

  if (navigator.canShare?.({ files: [exportFile] })) {
    try {
      await navigator.share({ title, text: subtitle, files: [exportFile] });
      return { success: true, method: 'shared' };
    } catch (error) {
      if (error.name === 'AbortError') return { aborted: true };
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { success: true, method: 'downloaded' };
};