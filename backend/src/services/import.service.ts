import crypto from 'crypto';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { ImportBatch, Order, BookStock } from '../models';
import { normalizeBookCode, normalizeTrackingId, normalizeMobileNumber, normalizeEmail, resolveCourierTracking } from '../utils/normalize';
import { logAudit } from '../utils/audit';
import { sendOrderEmail } from './email.service';
import { sendOrderWhatsAppMessage } from './whatsapp.service';

export interface ParsedRowData {
  rowNumber: number;
  studentName: string;
  mobileNumber: string;
  email: string | null;
  trackingId: string;
  courierName?: string;
  courierTrackingUrl?: string;
  productCode: string;
  productName: string;
  bookCode: string;
  bookName: string;
  quantity: number;
  errors: string[];
}

export interface ImportPreviewResult {
  fileHash: string;
  originalFileName: string;
  availableSheets?: string[];
  selectedSheetName?: string;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  isDuplicateFile: boolean;
  previousBatch?: {
    id: string;
    uploadedAt: Date;
    importedRows: number;
  } | null;
  validRows: ParsedRowData[];
  invalidRows: ParsedRowData[];
}

export const knownBookTitles: Record<string, string> = {
  'AFON-002': 'AFM Outnotes Nov 26 Combined',
  'AFOS1-002': 'AFM OutScanner Nov26 Part 1',
  'AFOS2-002': 'AFM OutScanner Nov26 Part 2',
  'AFON-001': 'AFM Outnotes Concept Book',
  'AFOS1-001': 'AFM Outscanner Vol 1',
  'AFOS2-001': 'AFM Outscanner Vol 2',
  'FIDTHW-009': 'IDT Handwritten 9.0',
  'FIDTQB-009': 'IDT Question Bank 9.0',
  'FIDTQB-09': 'IDT Question Bank 9.0',
  'IAEBR-001': 'Inter Audit Brahmastra',
  'IAEQB-001': 'Inter Audit QB',
  'IAEDC-001': 'Inter audit DC',
  'ICHW-005': 'CA Inter Cost Handwritten V5',
  'ICQB-005': 'CA Inter Cost Question Bank V5 combined',
  'ICMCQ-005': 'CA Inter Cost Theory + MCQ',
  'IFMHW-005': 'CA Inter FM Handwritten V5',
  'IFMQB-005': 'CA Inter FM QB + MCQ V5',
  'ISMHW-005': 'CA Inter SM Concept Notes',
  'ISMQB-005': 'CA Inter SM QB',
  'AQB-001': 'Audit QB Jan26',
  'AMCQ-001': 'Audit MCQ',
  'AQB-002': 'Audit QB Nov26',
  'ACR-001': 'Audit crush Full Book',
  'ADC-001': 'Audit Drone Charts Full (270 Pg)',
  'IFMHW-002': 'CA Inter FM Handwritten Notes',
  'IFMQB-002': 'CA Inter FM QB Book',
  'ISMHW-002': 'CA Inter SM Handwritten Notes',
  'ISMQB-002': 'CA Inter SM QB Book',
  'DTSM-001': 'DT Study Material',
  'DTQB-001': 'DT Question Bank / ITT',
  'FRSV1-001': 'FR Solver Vol 1',
  'FRSV2-001': 'FR Solver Vol 2',
  'FRSS-001': 'FR Sure Shot Notes',
  'FRBR1-001': 'FR Brahmastra Vol 1',
  'FRBR2-001': 'FR Brahmastra Vol 2',
  'FRST1-001': 'Striker Vol 1',
  'FRST2-001': 'Striker Vol 2',
  'FRA-001': 'FR Aimer',
  'IGSHW-008': 'Inter IDT Handwritten Book 8.0',
  'IGSQB-008': 'Inter IDT QB Book 8.0',
  'IGSHW-001': 'Inter IDT Handwritten Book 8.0',
  'IGSQB-001': 'Inter IDT QB Book 8.0',
  'ICHW-002': 'CA Inter Cost Handwritten V2',
  'ICQB-002': 'CA Inter Cost QB V2',
  'ICMCQ-002': 'CA Inter Cost MCQ V2'
};

export function deriveBookCodeFromTitle(title: string): string {
  if (!title) return 'BK101';
  const clean = title.replace(/[^a-zA-Z0-9\s.-]/g, '').trim();
  const words = clean.split(/\s+/).filter(
    (w) => !['the', 'of', 'and', 'for', 'in', 'full', 'book', 'module', 'set'].includes(w.toLowerCase())
  );
  if (words.length === 0) return 'BK101';
  return words.slice(0, 3).map((w) => w.toUpperCase()).join('-');
}

export async function parseAndPreviewExcel(
  buffer: Buffer,
  originalFileName: string,
  targetSheetName?: string
): Promise<ImportPreviewResult> {
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Check if this exact file hash was already uploaded
  let existingBatch: any = null;
  if (mongoose.connection.readyState === 1) {
    try {
      existingBatch = await ImportBatch.findOne({ fileHash, status: 'COMPLETED' })
        .select('_id uploadedAt importedRows')
        .sort({ uploadedAt: -1 });
    } catch (e) {
      // Graceful fallback
    }
  }

  const workbook = new ExcelJS.Workbook();
  if (originalFileName.toLowerCase().endsWith('.csv')) {
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    await workbook.csv.read(bufferStream);
  } else {
    await workbook.xlsx.load(buffer as any);
  }

  if (!workbook.worksheets || workbook.worksheets.length === 0) {
    throw { statusCode: 400, message: 'Uploaded file contains no worksheets', code: 'EMPTY_FILE' };
  }

  const availableSheets = workbook.worksheets.map((w) => w.name);

  // Pick target worksheet:
  // 1. If targetSheetName is provided, use that
  // 2. Otherwise default to the LAST worksheet (which in multi-tab dispatch workbooks is the latest day, e.g. "15-10")
  let worksheet = workbook.worksheets[workbook.worksheets.length - 1];
  if (targetSheetName) {
    const found = workbook.getWorksheet(targetSheetName);
    if (found) worksheet = found;
  }

  // 1. Scan rows 1 through 15 to find the true header row
  let headerRowIndex = 1;
  let headerRow = worksheet.getRow(1);
  const columnMap: Record<string, number> = {};

  for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    let hasName = false;
    let hasOther = false;
    row.eachCell((cell) => {
      const v = String(cell.value || '').trim().toLowerCase();
      if (v === 'name' || v === 'student' || v === 'student name' || v === 'student_name') {
        hasName = true;
      }
      if (
        v.includes('course') ||
        v.includes('p_code') ||
        v.includes('pcode') ||
        v.includes('p_books') ||
        v.includes('pbooks') ||
        v.includes('product') ||
        v.includes('book') ||
        v.includes('mobile') ||
        v.includes('phone') ||
        v.includes('tracking') ||
        v.includes('awb')
      ) {
        hasOther = true;
      }
    });
    if (hasName && hasOther) {
      headerRowIndex = r;
      headerRow = row;
      break;
    }
  }

  // Map header columns
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim().toLowerCase();

    // Student Name (avoid course name or product name)
    if (
      val === 'name' ||
      val === 'student' ||
      val === 'student_name' ||
      val === 'student name' ||
      val === 'customer_name' ||
      val === 'customer name'
    ) {
      columnMap['studentName'] = colNumber;
    } else if (
      (val.includes('student') || val.includes('customer') || val.includes('client')) &&
      val.includes('name')
    ) {
      columnMap['studentName'] = colNumber;
    }
    // Mobile Number
    else if (val.includes('mobile') || val.includes('phone') || val.includes('contact') || val === 'tel') {
      columnMap['mobileNumber'] = colNumber;
    }
    // Email
    else if (val.includes('email') || val.includes('mail')) {
      columnMap['email'] = colNumber;
    }
    // Courier tracking URL / link (e.g. "Track Your Package at", "Courier Parcel Link", "Tracking Link", etc.)
    else if (
      (val.includes('courier') || val.includes('tracking') || val.includes('track') || val.includes('package') || val.includes('shipment') || val.includes('parcel')) &&
      (val.includes('url') || val.includes('link') || val.includes('website') || val.includes('web site') || val.includes('at') || val.includes('portal') || val.includes('your'))
    ) {
      columnMap['courierTrackingUrl'] = colNumber;
    }
    // Courier company/name (e.g. "Couriered Through", "Courier", "Carrier", "Courier / Parcel")
    else if (
      val.includes('courier') ||
      val.includes('carrier') ||
      val.includes('parcel') ||
      val.includes('couried') ||
      val.includes('through') ||
      val.includes('tourght')
    ) {
      columnMap['courier'] = colNumber;
    }
    // Tracking ID / AWB / Barcode
    else if (
      val.includes('tracking') ||
      val.includes('awb') ||
      val.includes('docket') ||
      val.includes('waybill') ||
      val.includes('consignment') ||
      val.includes('barcode')
    ) {
      columnMap['trackingId'] = colNumber;
    }
    // Product Code: p_code, pcode, product code, prd code, item code, combo code
    else if (
      val.includes('p_code') ||
      val.includes('pcode') ||
      val === 'p code' ||
      ((val.includes('product') || val.includes('prd') || val.includes('combo') || val.includes('pkg')) && val.includes('code'))
    ) {
      columnMap['productCode'] = colNumber;
    }
    // Product Name / Course: course, course name, product name, package, combo
    else if (
      val.includes('course') ||
      ((val.includes('product') || val.includes('package') || val.includes('combo')) && val.includes('name'))
    ) {
      columnMap['productName'] = colNumber;
    }
    // p_Books / Books / Book Code
    else if (
      val.includes('p_books') ||
      val.includes('pbooks') ||
      val === 'p books' ||
      val === 'books' ||
      val === 'p_book'
    ) {
      columnMap['pBooks'] = colNumber;
      if (!columnMap['bookCode']) columnMap['bookCode'] = colNumber;
    } else if (val.includes('book') && val.includes('code')) {
      columnMap['bookCode'] = colNumber;
    } else if (val === 'book_code' || val === 'item_code' || val === 'sku' || val === 'isbn' || val === 'code') {
      columnMap['bookCode'] = colNumber;
    }
    // Book Name
    else if (val.includes('book') && val.includes('name')) {
      columnMap['bookName'] = colNumber;
    } else if (val === 'title' || val === 'book' || val === 'description') {
      columnMap['bookName'] = colNumber;
    }
    // Quantity
    else if (val.includes('quantity') || val.includes('qty') || val === 'count' || val === 'pcs') {
      columnMap['quantity'] = colNumber;
    }
  });

  // Verify minimal required columns
  const missingCols: string[] = [];
  if (!columnMap['studentName']) missingCols.push('Student Name (or Name)');
  if (!columnMap['mobileNumber']) missingCols.push('Mobile Number (or Phone)');
  if (!columnMap['pBooks'] && !columnMap['bookCode'] && !columnMap['productCode'] && !columnMap['productName'] && !columnMap['bookName']) {
    missingCols.push('Book/Product information (Course, P_Code, p_Books, or Book Name)');
  }

  if (missingCols.length > 0) {
    throw {
      statusCode: 400,
      message: `Missing required Excel columns: ${missingCols.join(', ')}. Please check your sheet headers.`,
      code: 'MISSING_COLUMNS',
    };
  }

  // 2. Fetch warehouse stock to auto-resolve book names
  const stockMap = new Map<string, string>();
  if (mongoose.connection.readyState === 1) {
    try {
      const stockItems = await BookStock.find({}).select('bookCode bookName').lean();
      for (const s of stockItems) {
        if (s.bookCode && s.bookName) {
          stockMap.set(normalizeBookCode(s.bookCode), s.bookName.trim());
        }
      }
    } catch (e) {
      // If DB has delay, will rely on knownBookTitles
    }
  }

  // 3. Prepare Date-based Barcode / Tracking ID prefix: DDMMYY (e.g. 161026)
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const datePrefix = `${dd}${mm}${yy}`;

  let maxCounter = 0;
  if (mongoose.connection.readyState === 1) {
    try {
      const todayOrders = await Order.find(
        {
          $or: [
            { orderCode: { $regex: `^${datePrefix}` } },
            { trackingId: { $regex: `^${datePrefix}` } },
          ],
        },
        { orderCode: 1, trackingId: 1 }
      ).lean();

      for (const o of todayOrders) {
        for (const field of [o.orderCode, o.trackingId]) {
          if (field && field.startsWith(datePrefix)) {
            const numPart = parseInt(field.slice(datePrefix.length), 10);
            if (!isNaN(numPart) && numPart > maxCounter) {
              maxCounter = numPart;
            }
          }
        }
      }
    } catch (e) {}
  }

  let autoTrackingCounter = maxCounter + 1;

  const validRows: ParsedRowData[] = [];
  const invalidRows: ParsedRowData[] = [];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mobileRegex = /^[0-9+ -]{7,15}$/;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return; // Skip header row and metadata before it

    let hasAnyData = false;
    row.eachCell(() => { hasAnyData = true; });
    if (!hasAnyData) return;

    const rawStudent = columnMap['studentName'] ? row.getCell(columnMap['studentName']).value : null;
    const rawMob = columnMap['mobileNumber'] ? row.getCell(columnMap['mobileNumber']).value : null;

    const studentStr = rawStudent ? String(rawStudent).trim() : '';
    const studentLower = studentStr.toLowerCase();

    // Skip empty lines, courier company section labels (e.g. "DTDC", "Trackon", "ADD. REQ", "Total", "P_Type")
    if (!studentStr && !rawMob) return;
    if (
      studentLower === 'trackon' ||
      studentLower === 'dtdc' ||
      studentLower.includes('add. req') ||
      studentLower === 'total' ||
      studentLower === 'p_type' ||
      studentLower === 'name' ||
      studentLower === 'course'
    ) {
      return;
    }

    const rowErrors: string[] = [];
    const studentName = studentStr;
    const mobileNumber = normalizeMobileNumber(rawMob as any);
    const rawEmail = columnMap['email'] ? row.getCell(columnMap['email']).value : null;
    const rawQuantity = columnMap['quantity'] ? row.getCell(columnMap['quantity']).value : 1;
    const email = rawEmail ? normalizeEmail(String(rawEmail)) : null;
    const parsedQuantity = Number(rawQuantity);
    const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : NaN;
    const rawCourier = columnMap['courier'] ? String(row.getCell(columnMap['courier']).value || '').trim() : '';
    const rawCourierUrl = columnMap['courierTrackingUrl']
      ? String(row.getCell(columnMap['courierTrackingUrl']).value || '').trim()
      : '';
    const courierValueIsUrl = /^(https?:\/\/|www\.)/i.test(rawCourier) || /\.[a-z]{2,}(\/|$)/i.test(rawCourier);
    let courierName = courierValueIsUrl ? '' : rawCourier;
    let courierTrackingUrl = rawCourierUrl || (courierValueIsUrl ? rawCourier : '');

    // Fallback 1: Scan cells for any raw URL if courierTrackingUrl is still missing
    if (!courierTrackingUrl) {
      row.eachCell((cell) => {
        const strVal = String(cell.value || '').trim();
        if (/^https?:\/\//i.test(strVal) && !courierTrackingUrl) {
          courierTrackingUrl = strVal;
        }
      });
    }

    // Fallback 2: If courierName is still empty, scan row cells for any known courier keywords
    if (!courierName) {
      row.eachCell((cell) => {
        const strVal = String(cell.value || '').trim();
        if (/dtdc/i.test(strVal)) courierName = 'DTDC';
        else if (/track[ou]n/i.test(strVal)) courierName = 'Trackon';
        else if (/india\s*post|speed\s*post/i.test(strVal)) courierName = 'India Post';
        else if (/delhivery/i.test(strVal)) courierName = 'Delhivery';
      });
    }

    // Auto-resolve Courier Name & Tracking Link (DTDC, Trackon, India Post, Delhivery)
    const courierResolved = resolveCourierTracking(courierName, courierTrackingUrl);
    courierName = courierResolved.courierName;
    courierTrackingUrl = courierResolved.courierTrackingUrl;

    if (!studentName) rowErrors.push('Student name is required.');
    if (!mobileNumber) {
      rowErrors.push('Mobile number is required.');
    } else if (!mobileRegex.test(mobileNumber)) {
      rowErrors.push('Invalid mobile number format.');
    }
    if (rawEmail && email && !emailRegex.test(email)) {
      rowErrors.push('Invalid email format.');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      rowErrors.push('Quantity must be a positive integer greater than 0.');
    }

    // Tracking ID: if column present and non-empty, use it; else auto-generate DDMMYYNNN
    let trackingId = '';
    const rawTrack = columnMap['trackingId'] ? row.getCell(columnMap['trackingId']).value : null;
    if (rawTrack && String(rawTrack).trim()) {
      trackingId = normalizeTrackingId(rawTrack as any);
    } else {
      trackingId = `${datePrefix}${String(autoTrackingCounter).padStart(3, '0')}`;
      autoTrackingCounter++;
    }

    // Extract Course / Product info
    const rawCourse = columnMap['productName'] ? String(row.getCell(columnMap['productName']).value || '').trim() : '';
    const rawPCode = columnMap['productCode'] ? String(row.getCell(columnMap['productCode']).value || '').trim() : '';
    const rawBooks = (columnMap['pBooks'] ? String(row.getCell(columnMap['pBooks']).value || '').trim() : '') ||
                     (columnMap['bookCode'] ? String(row.getCell(columnMap['bookCode']).value || '').trim() : rawPCode);
    const rawBookName = columnMap['bookName'] ? String(row.getCell(columnMap['bookName']).value || '').trim() : '';

    // Split multi-line cells (\n)
    const courseLines = rawCourse.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const pCodeLines = rawPCode.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const booksLines = rawBooks.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const bookNameLines = rawBookName.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    const totalProductLines = Math.max(courseLines.length, pCodeLines.length, booksLines.length, 1);

    for (let pIdx = 0; pIdx < totalProductLines; pIdx++) {
      const pName = courseLines[pIdx] || courseLines[0] || rawBookName || 'Product';
      const pCode = pCodeLines[pIdx] || pCodeLines[0] || rawPCode;
      const bCodesStr = booksLines[pIdx] || booksLines[0] || pCode;
      const explicitBookName = bookNameLines[pIdx] || bookNameLines[0] || '';

      // Split comma-separated books: e.g. "AFON-002, AFOS1-002, AFOS2-002"
      const bookCodes = bCodesStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (bookCodes.length === 0) {
        rowErrors.push('Book code is required for dispatch.');
        bookCodes.push('');
      }

      for (const rawCode of bookCodes) {
        const cleanBookCode = normalizeBookCode(rawCode);
        const cleanProductCode = normalizeBookCode(pCode);

        // Resolve Book Name:
        // 1. Stock database
        // 2. Known dictionary
        // 3. Explicit book name from Excel
        // 4. Fallback to course name
        let resolvedBookName =
          stockMap.get(cleanBookCode) ||
          knownBookTitles[cleanBookCode] ||
          explicitBookName ||
          `${pName} (${cleanBookCode})`;

        const rowItem: ParsedRowData = {
          rowNumber,
          studentName,
          mobileNumber,
          email,
          trackingId,
          courierName,
          courierTrackingUrl,
          productCode: cleanProductCode,
          productName: pName,
          bookCode: cleanBookCode,
          bookName: resolvedBookName,
          quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
          errors: [...rowErrors],
        };

        if (rowErrors.length > 0) {
          invalidRows.push(rowItem);
        } else {
          validRows.push(rowItem);
        }
      }
    }
  });

  return {
    fileHash,
    originalFileName,
    availableSheets,
    selectedSheetName: worksheet.name,
    totalRows: validRows.length + invalidRows.length,
    validRowsCount: validRows.length,
    invalidRowsCount: invalidRows.length,
    isDuplicateFile: !!existingBatch,
    previousBatch: existingBatch
      ? {
          id: existingBatch._id.toString(),
          uploadedAt: existingBatch.uploadedAt,
          importedRows: existingBatch.importedRows,
        }
      : null,
    validRows,
    invalidRows,
  };
}

export async function exportInvalidRowsExcel(invalidRows: ParsedRowData[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Invalid Rows');

  worksheet.columns = [
    { header: 'Row #', key: 'rowNumber', width: 10 },
    { header: 'Student Name', key: 'studentName', width: 25 },
    { header: 'Mobile Number', key: 'mobileNumber', width: 18 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Tracking ID', key: 'trackingId', width: 16 },
    { header: 'Product Code', key: 'productCode', width: 16 },
    { header: 'Product Name', key: 'productName', width: 30 },
    { header: 'Book Code', key: 'bookCode', width: 15 },
    { header: 'Book Name', key: 'bookName', width: 25 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Validation Errors', key: 'errors', width: 45 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD32F2F' },
  };

  invalidRows.forEach((row) => {
    worksheet.addRow({
      rowNumber: row.rowNumber,
      studentName: row.studentName,
      mobileNumber: row.mobileNumber,
      email: row.email || '',
      trackingId: row.trackingId,
      productCode: row.productCode,
      productName: row.productName,
      bookCode: row.bookCode,
      bookName: row.bookName,
      quantity: row.quantity,
      errors: row.errors.join(' | '),
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function confirmImport(
  userId: string,
  originalFileName: string,
  fileHash: string,
  validRows: ParsedRowData[],
  invalidRowsSummary: any[] = []
) {
  if (!validRows || validRows.length === 0) {
    throw { statusCode: 400, message: 'No valid rows to import', code: 'NO_VALID_ROWS' };
  }

  const batch = await ImportBatch.create({
    originalFileName,
    uploadedByUserId: new mongoose.Types.ObjectId(userId),
    status: 'COMPLETED',
    totalRows: validRows.length + invalidRowsSummary.length,
    validRows: validRows.length,
    invalidRows: invalidRowsSummary.length,
    importedRows: validRows.length,
    fileHash,
    errorSummary: invalidRowsSummary,
  });

  // Group rows by Tracking ID + Student Name to create unified Orders
  const orderGroups = new Map<string, {
    studentName: string;
    mobileNumber: string;
    email: string | null;
    trackingId: string;
    courierName: string;
    courierTrackingUrl: string;
    items: {
      productCode: string;
      productName: string;
      bookCode: string;
      bookName: string;
      requiredQuantity: number;
    }[];
  }>();

  for (const row of validRows) {
    const orderKey = `${row.trackingId}:::${row.studentName}`;
    if (!orderGroups.has(orderKey)) {
      orderGroups.set(orderKey, {
        studentName: row.studentName,
        mobileNumber: row.mobileNumber,
        email: row.email,
        trackingId: row.trackingId,
        courierName: row.courierName || '',
        courierTrackingUrl: row.courierTrackingUrl || '',
        items: [],
      });
    } else {
      const existingGroup = orderGroups.get(orderKey)!;
      if (!existingGroup.courierName && row.courierName) existingGroup.courierName = row.courierName;
      if (!existingGroup.courierTrackingUrl && row.courierTrackingUrl) {
        existingGroup.courierTrackingUrl = row.courierTrackingUrl;
      }
    }

    const group = orderGroups.get(orderKey)!;
    // If the same book appears multiple times in the same order, increment quantity
    const existing = group.items.find((i) => i.bookCode === row.bookCode);
    if (existing) {
      existing.requiredQuantity += row.quantity;
    } else {
      group.items.push({
        productCode: row.productCode || '',
        productName: row.productName || 'Product',
        bookCode: row.bookCode,
        bookName: row.bookName,
        requiredQuantity: row.quantity,
      });
    }
  }

  let createdOrdersCount = 0;
  let createdItemsCount = 0;
  let orderCodeCounter = 1;

  // Generate order code based on upload date: DDMMYYNNN e.g. 161026001, 161026002...
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const orderPrefix = `${dd}${mm}${yy}`;

  // Find all orders starting with today's orderPrefix to find the highest sequence number
  const todayOrders = await Order.find(
    { orderCode: { $regex: `^${orderPrefix}` } },
    { orderCode: 1 }
  ).lean();

  let maxCounter = 0;
  for (const o of todayOrders) {
    if (o.orderCode) {
      const numPart = parseInt(o.orderCode.slice(orderPrefix.length), 10);
      if (!isNaN(numPart) && numPart > maxCounter) {
        maxCounter = numPart;
      }
    }
  }
  orderCodeCounter = maxCounter + 1;

  for (const orderData of orderGroups.values()) {
    // Keep the generated student code independent from the Excel tracking ID.
    const orderCode = `${orderPrefix}${String(orderCodeCounter).padStart(3, '0')}`;
    orderCodeCounter++;

    // Primary product code from the first item
    const primaryProductCode = orderData.items[0]?.productCode || '';

    await Order.create({
      orderCode,
      productCode: primaryProductCode,
      studentName: orderData.studentName,
      mobileNumber: orderData.mobileNumber,
      email: orderData.email,
      trackingId: orderData.trackingId,
      courierName: orderData.courierName,
      courierTrackingUrl: orderData.courierTrackingUrl,
      importBatchId: batch._id,
      items: orderData.items.map((item) => ({
        productCode: item.productCode,
        productName: item.productName,
        bookCode: item.bookCode,
        bookName: item.bookName,
        requiredQuantity: item.requiredQuantity,
        dispatchedQuantity: 0,
      })),
    });

    createdOrdersCount += 1;
    createdItemsCount += orderData.items.length;
  }

  await logAudit({
    actorUserId: userId,
    action: 'EXCEL_IMPORT_COMPLETED',
    entityType: 'ImportBatch',
    entityId: batch._id.toString(),
    metadata: {
      fileName: originalFileName,
      totalRows: batch.totalRows,
      importedRows: batch.importedRows,
      createdOrdersCount,
      createdItemsCount,
    },
  });

  const importedOrders = await Order.find({ importBatchId: batch._id });
  const notificationOutcomes = await Promise.all(importedOrders.map(async (order) => {
    const items = order.items.map((item) => ({
      bookCode: item.bookCode,
      bookName: item.bookName,
      productName: item.productName,
      requiredQuantity: item.requiredQuantity,
      dispatchedQuantity: item.dispatchedQuantity,
    }));

    const [emailOutcome, whatsappOutcome] = await Promise.all([
      (async () => {
        try {
          const delivery = await sendOrderEmail(
            {
              name: order.studentName,
              email: order.email,
              trackingId: order.trackingId,
              orderCode: order.orderCode,
            },
            items
          );
          if (!delivery.sent) {
            const reason = 'reason' in delivery ? delivery.reason : 'UNKNOWN';
            console.warn(`[IMPORT] Email not sent for order ${order._id}: ${reason}`);
          }
          return delivery;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[IMPORT] Email send failed for order ${order._id}: ${reason}`);
          return { sent: false, reason: 'DELIVERY_FAILED' };
        }
      })(),
      (async () => {
        try {
          const delivery = await sendOrderWhatsAppMessage(
            {
              name: order.studentName,
              mobileNumber: order.mobileNumber,
              trackingId: order.trackingId,
              orderCode: order.orderCode,
              courierName: order.courierName || '',
              courierTrackingUrl: order.courierTrackingUrl || '',
              dispatchDate: new Date(),
              email: order.email,
            },
            items
          );
          if (!delivery.sent) {
            const reason = 'reason' in delivery ? delivery.reason : 'UNKNOWN';
            console.warn(`[IMPORT] WhatsApp not sent for order ${order._id}: ${reason}`);
          }
          return delivery;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[IMPORT] WhatsApp send failed for order ${order._id}: ${reason}`);
          return { sent: false, reason: 'DELIVERY_FAILED' };
        }
      })(),
    ]);

    const sentAt = new Date();
    if (emailOutcome.sent) order.emailSentAt = sentAt;
    if (whatsappOutcome.sent) order.whatsappSentAt = sentAt;
    if (emailOutcome.sent || whatsappOutcome.sent) await order.save();

    return { emailSent: emailOutcome.sent, whatsappSent: whatsappOutcome.sent };
  }));

  const emailSentCount = notificationOutcomes.filter((outcome) => outcome.emailSent).length;
  const whatsappSentCount = notificationOutcomes.filter((outcome) => outcome.whatsappSent).length;

  return {
    batchId: batch._id.toString(),
    createdOrdersCount,
    createdItemsCount,
    uploadedAt: batch.uploadedAt,
    whatsappNotifications: {
      total: importedOrders.length,
      accepted: whatsappSentCount,
      notAccepted: importedOrders.length - whatsappSentCount,
    },
    emailNotifications: {
      total: importedOrders.length,
      accepted: emailSentCount,
      notAccepted: importedOrders.length - emailSentCount,
    },
  };
}

export async function listImportBatches(page = 1, limit = 10) {
  const skip = (page - 1) * limit;

  const [batches, total] = await Promise.all([
    ImportBatch.find()
      .populate('uploadedByUserId', 'name email')
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit),
    ImportBatch.countDocuments(),
  ]);

  const mapped = await Promise.all(
    batches.map(async (b) => {
      const orderCount = await Order.countDocuments({ importBatchId: b._id });
      return {
        id: b._id.toString(),
        originalFileName: b.originalFileName,
        uploadedByUserId: b.uploadedByUserId,
        uploadedByUser: b.uploadedByUserId,
        uploadedAt: b.uploadedAt,
        status: b.status,
        totalRows: b.totalRows,
        validRows: b.validRows,
        invalidRows: b.invalidRows,
        importedRows: b.importedRows,
        fileHash: b.fileHash,
        errorSummary: b.errorSummary,
        _count: { orders: orderCount },
      };
    })
  );

  return {
    batches: mapped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getImportBatchById(batchId: string) {
  const batch = await ImportBatch.findById(batchId).populate('uploadedByUserId', 'name email');

  if (!batch) {
    throw { statusCode: 404, message: 'Import batch not found', code: 'BATCH_NOT_FOUND' };
  }

  const orders = await Order.find({ importBatchId: batch._id }).limit(50);

  return {
    id: batch._id.toString(),
    originalFileName: batch.originalFileName,
    uploadedByUser: batch.uploadedByUserId,
    uploadedAt: batch.uploadedAt,
    status: batch.status,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    importedRows: batch.importedRows,
    errorSummary: batch.errorSummary,
    orders: orders.map((o) => ({
      id: o._id.toString(),
      studentName: o.studentName,
      trackingId: o.trackingId,
      items: o.items.map((i) => ({
        id: i._id.toString(),
        bookCode: i.bookCode,
        bookName: i.bookName,
        requiredQuantity: i.requiredQuantity,
        dispatchedQuantity: i.dispatchedQuantity,
      })),
    })),
  };
}
