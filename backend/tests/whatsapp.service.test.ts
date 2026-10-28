import { describe, expect, it } from 'vitest';
import { buildTeleobiPayload } from '../src/services/whatsapp.service';

describe('Teleobi WhatsApp payload', () => {
  it('includes a text value for every template field when optional order data is missing', () => {
    const payload = buildTeleobiPayload(
      {
        name: 'Student Name',
        mobileNumber: '9892098500',
        trackingId: 'TRACK-123',
        dispatchDate: new Date('2026-10-24T20:30:00.000Z'),
      },
      [
        {
          bookCode: 'BOOK-001',
          bookName: 'Book One',
          productName: 'Course One',
          requiredQuantity: 2,
          dispatchedQuantity: 2,
        },
      ]
    );

    expect(payload.rowNumber).toBe(2);
    expect(payload.type).toBe('EDIT');
    expect(payload.rowData).toHaveLength(19);
    expect(payload.rowData.every((value) => String(value).trim().length > 0)).toBe(true);
    expect(payload.rowData[2]).toBe('TRACK-123');
    expect(payload.rowData[3]).toBe('Student Name');
    expect(payload.rowData[1]).toBe('25/10/2026');
    expect(payload.rowData[16]).toBe('25/10/2026');
    expect(payload.rowData[5]).toBe('Course One');
    expect(payload.rowData[7]).toBe(2);
    expect(payload.rowData[9]).toBe('Book One');
    expect(payload.rowData[11]).toBe('Not provided');
    expect(payload.rowData[12]).toBe('DTDC');
    expect(payload.rowData[13]).toBe('https://www.dtdc.com/track-your-shipment/');
    expect(payload.rowData[15]).toBe('Not available');
    expect(payload.rowData[17]).toBe('919892098500');
  });

  it('resolves correct tracking URL for Trackon / trackun', () => {
    const payload = buildTeleobiPayload(
      {
        name: 'Student Name',
        mobileNumber: '9892098500',
        trackingId: 'TRACK-123',
        courierName: 'trackun',
      },
      [{ bookCode: 'B1', bookName: 'Book', requiredQuantity: 1, dispatchedQuantity: 1 }]
    );

    expect(payload.courierName).toBe('Trackon');
    expect(payload.courierTrackingUrl).toBe('https://www.trackon.in/');
    expect(payload.rowData[12]).toBe('Trackon');
    expect(payload.rowData[13]).toBe('https://www.trackon.in/');
  });

  it('resolves correct tracking URL for India Post', () => {
    const payload = buildTeleobiPayload(
      {
        name: 'Student Name',
        mobileNumber: '9892098500',
        trackingId: 'TRACK-123',
        courierName: 'India Post Speed Post',
      },
      [{ bookCode: 'B1', bookName: 'Book', requiredQuantity: 1, dispatchedQuantity: 1 }]
    );

    expect(payload.courierName).toBe('India Post');
    expect(payload.courierTrackingUrl).toBe('https://www.indiapost.gov.in/');
    expect(payload.rowData[12]).toBe('India Post');
    expect(payload.rowData[13]).toBe('https://www.indiapost.gov.in/');
  });

  it('resolves correct tracking URL for Couriered Through: DTDC', () => {
    const payload = buildTeleobiPayload(
      {
        name: 'Student Name',
        mobileNumber: '9892098500',
        trackingId: 'TRACK-123',
        courierName: 'Couriered Through: DTDC',
      },
      [{ bookCode: 'B1', bookName: 'Book', requiredQuantity: 1, dispatchedQuantity: 1 }]
    );

    expect(payload.courierName).toBe('DTDC');
    expect(payload.courierTrackingUrl).toBe('https://www.dtdc.com/track-your-shipment/');
    expect(payload.rowData[12]).toBe('DTDC');
    expect(payload.rowData[13]).toBe('https://www.dtdc.com/track-your-shipment/');
  });
});
