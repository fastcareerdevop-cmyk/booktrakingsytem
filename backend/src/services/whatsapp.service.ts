import { ENV } from '../config/env';

type WhatsAppStudent = {
  name: string;
  mobileNumber?: string | null;
  trackingId: string;
  orderCode?: string;
  courierName?: string;
  courierTrackingUrl?: string;
  dispatchDate?: Date;
  email?: string | null;
};

type WhatsAppItem = {
  bookCode: string;
  bookName: string;
  requiredQuantity: number;
  dispatchedQuantity: number;
  productName?: string;
};

export function buildTeleobiPayload(student: WhatsAppStudent, items: WhatsAppItem[]) {
  const digits = (student.mobileNumber || '').replace(/\D/g, '');
  const normalizedDigits = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  const cleanNumber = normalizedDigits.length === 10 ? `91${normalizedDigits}` : normalizedDigits;

  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(student.dispatchDate || new Date());
  const datePart = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((part) => part.type === type)?.value || '';
  const dispatchDate = `${datePart('day')}/${datePart('month')}/${datePart('year')}`;
  const productNames = [...new Set(
    items
      .map((item) => item.productName?.trim())
      .filter((name): name is string => Boolean(name && name !== 'Product' && name !== 'Default Product'))
  )];
  const bookNames = [...new Set(items.map((item) => item.bookName.trim()).filter(Boolean))];
  const orderName = productNames.length > 0
    ? productNames.join(' & ')
    : bookNames.join(' & ');
  const textOrFallback = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;

  const resolvedCourier = textOrFallback(student.courierName, 'DTDC');
  let resolvedTrackingUrl = (student.courierTrackingUrl || '').trim();
  if (!resolvedTrackingUrl || resolvedTrackingUrl.toLowerCase() === 'not available') {
    if (resolvedCourier.toUpperCase().includes('DTDC')) {
      resolvedTrackingUrl = 'https://www.dtdc.com/track-your-shipment/';
    } else if (resolvedCourier.toUpperCase().includes('TRACKON')) {
      resolvedTrackingUrl = 'https://trackon.in/';
    } else if (resolvedCourier.toUpperCase().includes('DELHIVERY')) {
      resolvedTrackingUrl = 'https://www.delhivery.com/';
    } else if (resolvedCourier.toUpperCase().includes('POST')) {
      resolvedTrackingUrl = 'https://www.indiapost.gov.in/';
    } else {
      resolvedTrackingUrl = 'https://www.dtdc.com/track-your-shipment/';
    }
  }

  const rowData: Array<string | number> = [
    1,
    dispatchDate,
    textOrFallback(student.trackingId, 'Not available'),
    textOrFallback(student.name, 'Student'),
    textOrFallback(normalizedDigits, 'Not available'),
    textOrFallback(productNames[0], textOrFallback(orderName, 'Books')),
    textOrFallback(productNames.slice(1).join(' & '), 'Not available'),
    items.reduce((total, item) => total + item.requiredQuantity, 0),
    'Books',
    textOrFallback(bookNames.join(' & '), 'Not available'),
    'Books',
    textOrFallback(student.email, 'Not provided'),
    resolvedCourier,
    resolvedTrackingUrl,
    textOrFallback(orderName, 'Books'),
    textOrFallback(student.orderCode, 'Not available'),
    dispatchDate,
    textOrFallback(cleanNumber, 'Not available'),
    1,
  ];

  return {
    rowNumber: 2,
    rowData,
    type: 'EDIT',
    phone: cleanNumber,
    mobile: cleanNumber,
    phoneNumber: `+${cleanNumber}`,
    studentName: student.name,
    trackingId: student.trackingId,
    orderCode: student.orderCode || '',
    courierName: resolvedCourier,
    courierTrackingUrl: resolvedTrackingUrl,
    trackYourPackageAt: resolvedTrackingUrl,
    books: bookNames.join(' & '),
    product: orderName,
    dispatchDate,
  };
}

export async function sendOrderWhatsAppMessage(student: WhatsAppStudent, items: WhatsAppItem[]) {
  const digits = (student.mobileNumber || '').replace(/\D/g, '');
  const normalizedDigits = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  const cleanNumber = normalizedDigits.length === 10 ? `91${normalizedDigits}` : normalizedDigits;

  if (!cleanNumber) {
    console.warn(`[WHATSAPP] Skipping order: No valid mobile number for ${student.name}`);
    return { sent: false, reason: 'NO_MOBILE' };
  }

  const webhookUrl = ENV.WHATSAPP_WEBHOOK_URL?.trim();
  if (!ENV.WHATSAPP_ENABLED || !webhookUrl) {
    console.warn(
      `[WHATSAPP] Not sent: enabled=${ENV.WHATSAPP_ENABLED}, webhookUrlConfigured=${Boolean(webhookUrl)}`
    );
    return {
      sent: false,
      fallback: true,
      reason: 'NOT_CONFIGURED',
      webhookUrl,
      preview: `${student.name} (${student.trackingId}) — WhatsApp message queued for local testing`,
    };
  }

  const payload = buildTeleobiPayload(student, items);
  console.info(`[WHATSAPP] Sending to ${cleanNumber} (${student.name}) via Teleobi webhook...`);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  if (!response.ok) {
    console.error(`[WHATSAPP] Teleobi webhook failed (HTTP ${response.status}): ${text}`);
    throw new Error(`WhatsApp webhook failed: ${response.status} ${text}`);
  }
  if (/parameter of type text is missing text value/i.test(text)) {
    console.error(`[WHATSAPP] Teleobi template parameter rejected: ${text}`);
    throw new Error(`Teleobi rejected the WhatsApp template parameters: ${text}`);
  }

  console.info(`[WHATSAPP] Teleobi webhook response (HTTP ${response.status}): ${text.slice(0, 300)}`);

  return {
    sent: true,
    fallback: false,
    status: response.status,
    response: text.slice(0, 1000),
  };
}
