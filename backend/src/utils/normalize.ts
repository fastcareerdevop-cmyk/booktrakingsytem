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
  trackingUrlInput?: string | null,
  trackingIdInput?: string | null
): ResolvedCourier {
  const rawCourier = String(courierInput || '').trim();
  const rawUrl = String(trackingUrlInput || '').trim();
  const rawTrack = String(trackingIdInput || '').trim().toUpperCase();

  // Strip common prefixes like "Couriered Through:", "Courier:", "Parcel:", "Through:"
  let cleanName = rawCourier
    .replace(/^(couriered\s*(?:through|tourght)?|courier\s*(?:\/|\&)?\s*parcel|courier|parcel|through|carrier)\s*[:\-]?\s*/i, '')
    .trim();
  if (!cleanName) cleanName = rawCourier;

  const combined = `${cleanName} ${rawUrl}`.toLowerCase();

  // 1. Explicit courier name matches
  if (/dtdc/i.test(combined)) {
    return {
      courierName: 'DTDC',
      courierTrackingUrl: 'https://www.dtdc.com/track-your-shipment/',
    };
  }

  if (/track[ou]n/i.test(combined)) {
    return {
      courierName: 'Trackon',
      courierTrackingUrl: 'https://www.trackon.in/',
    };
  }

  if (/india\s*post|speed\s*post|\bpost\b|indiapost/i.test(combined)) {
    return {
      courierName: 'India Post',
      courierTrackingUrl: 'https://www.indiapost.gov.in/',
    };
  }

  if (/delhivery/i.test(combined)) {
    return {
      courierName: 'Delhivery',
      courierTrackingUrl: 'https://www.delhivery.com/',
    };
  }

  // 2. Detect from Tracking ID / AWB format if courierName is not specified or generic
  if (rawTrack) {
    // India Post: ends with IN (e.g. C1144011340IN, EM123456789IN, ED...IN, EK...IN)
    if (/^[A-Z]{2}\d{9}IN$/i.test(rawTrack) || /IN$/i.test(rawTrack)) {
      return {
        courierName: 'India Post',
        courierTrackingUrl: 'https://www.indiapost.gov.in/',
      };
    }

    // Trackon: 12-digit numeric starting with 500 or 50 (e.g. 500721853337)
    if (/^50\d{8,11}$/.test(rawTrack) || /^500\d+/.test(rawTrack)) {
      return {
        courierName: 'Trackon',
        courierTrackingUrl: 'https://www.trackon.in/',
      };
    }

    // DTDC: Starts with D, Z, B, or K followed by digits (e.g. D1020119929)
    if (/^[DZBK]\d{7,10}$/i.test(rawTrack) || /^D\d+/i.test(rawTrack)) {
      return {
        courierName: 'DTDC',
        courierTrackingUrl: 'https://www.dtdc.com/track-your-shipment/',
      };
    }
  }

  // 3. Direct URL fallback
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

  // 4. If cleanName was explicitly provided, use it
  if (cleanName && !/^https?:\/\//i.test(cleanName)) {
    return {
      courierName: cleanName,
      courierTrackingUrl: 'https://www.dtdc.com/track-your-shipment/',
    };
  }

  // 5. Default fallback based on tracking pattern: 50... is Trackon, else DTDC
  if (/^50\d+/.test(rawTrack)) {
    return {
      courierName: 'Trackon',
      courierTrackingUrl: 'https://www.trackon.in/',
    };
  }

  return {
    courierName: 'DTDC',
    courierTrackingUrl: 'https://www.dtdc.com/track-your-shipment/',
  };
}
