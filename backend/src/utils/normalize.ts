export function normalizeBookCode(code: string | number | undefined | null): string {
  if (code === undefined || code === null) return '';
  return String(code).trim().toUpperCase();
}

export function normalizeTrackingId(id: string | number | undefined | null): string {
  if (id === undefined || id === null) return '';
  return String(id).trim().toUpperCase();
}

export function normalizeMobileNumber(mobile: string | number | undefined | null): string {
  if (mobile === undefined || mobile === null) return '';
  // Convert number or string to string, preserving leading zeroes
  return String(mobile).trim();
}

export function normalizeEmail(email: string | undefined | null): string | null {
  if (!email) return null;
  const trimmed = String(email).trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export interface ResolvedCourier {
  courierName: string;
  courierTrackingUrl: string;
}

export function resolveCourierTracking(
  courierInput?: string | null,
  trackingUrlInput?: string | null
): ResolvedCourier {
  const rawCourier = String(courierInput || '').trim();
  const rawUrl = String(trackingUrlInput || '').trim();

  // Strip common prefixes like "Couriered Through:", "Courier:", "Parcel:", "Through:"
  let cleanName = rawCourier
    .replace(/^(couriered\s*(?:through|tourght)?|courier\s*(?:\/|\&)?\s*parcel|courier|parcel|through|carrier)\s*[:\-]?\s*/i, '')
    .trim();
  if (!cleanName) cleanName = rawCourier;

  const combined = `${cleanName} ${rawUrl}`.toLowerCase();

  // 1. DTDC -> https://www.dtdc.com/track-your-shipment/
  if (/dtdc/i.test(combined)) {
    return {
      courierName: 'DTDC',
      courierTrackingUrl: 'https://www.dtdc.com/track-your-shipment/',
    };
  }

  // 2. Trackon / trackun -> https://www.trackon.in/
  if (/track[ou]n/i.test(combined)) {
    return {
      courierName: 'Trackon',
      courierTrackingUrl: 'https://www.trackon.in/',
    };
  }

  // 3. India Post / Speed Post -> https://www.indiapost.gov.in/
  if (/india\s*post|speed\s*post|\bpost\b|indiapost/i.test(combined)) {
    return {
      courierName: 'India Post',
      courierTrackingUrl: 'https://www.indiapost.gov.in/',
    };
  }

  // 4. Delhivery -> https://www.delhivery.com/
  if (/delhivery/i.test(combined)) {
    return {
      courierName: 'Delhivery',
      courierTrackingUrl: 'https://www.delhivery.com/',
    };
  }

  // 5. If a direct URL was provided in trackingUrlInput or courierInput
  const directUrl = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : /^https?:\/\//i.test(rawCourier)
    ? rawCourier
    : '';

  if (directUrl) {
    return {
      courierName: cleanName && !/^https?:\/\//i.test(cleanName) ? cleanName : 'Courier',
      courierTrackingUrl: directUrl,
    };
  }

  // 6. Default fallback: DTDC
  return {
    courierName: cleanName || 'DTDC',
    courierTrackingUrl: 'https://www.dtdc.com/track-your-shipment/',
  };
}
