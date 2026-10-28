import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { ENV } from '../config/env';

// ─── Resend HTTP REST API client (Port 443 — bypasses all Render SMTP port blocks) ───
const resendClient = ENV.RESEND_API_KEY ? new Resend(ENV.RESEND_API_KEY) : null;

// ─── Gmail SMTP transport (fallback for local development only) ─────────────────
const hasSmtpConfig = Boolean(ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS);
function createSmtpTransport() {
  if (!hasSmtpConfig) return null;
  return nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT,
    secure: ENV.SMTP_PORT === 465,
    auth: {
      user: ENV.SMTP_USER,
      pass: ENV.SMTP_PASS,
    },
  });
}

const smtpTransporter = createSmtpTransport();

export async function verifyEmailTransport() {
  if (!ENV.EMAIL_ENABLED) {
    console.info('[EMAIL] Sending is disabled (EMAIL_ENABLED is not true).');
    return;
  }

  if (resendClient) {
    console.info('[EMAIL] Resend HTTP API configured and active (HTTPS port 443).');
    return;
  }

  if (smtpTransporter) {
    try {
      await smtpTransporter.verify();
      console.info(`[EMAIL] SMTP transport verified for ${ENV.SMTP_USER}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[EMAIL] SMTP transport check failed: ${message}`);
    }
  } else {
    console.warn('[EMAIL] No transport configured. Set RESEND_API_KEY or SMTP_HOST+SMTP_USER+SMTP_PASS.');
  }
}

export async function sendOrderEmail(
  student: {
    name: string;
    email: string | null;
    trackingId: string;
    orderCode?: string;
  },
  items: Array<{ bookCode: string; bookName: string; requiredQuantity: number; dispatchedQuantity: number }>
) {
  if (!student.email) {
    return { sent: false, reason: 'NO_EMAIL' };
  }

  if (!ENV.EMAIL_ENABLED || (!resendClient && !smtpTransporter)) {
    console.warn('[EMAIL] Not sent: EMAIL_ENABLED is false or no transport (Resend/SMTP) configured.');
    return { sent: false, fallback: true, reason: 'NOT_CONFIGURED' };
  }

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${item.bookCode}</td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${item.bookName}</td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb; text-align:center;">${item.requiredQuantity}</td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb; text-align:center;">${item.dispatchedQuantity}</td>
        </tr>`
    )
    .join('');

  const subject = `We received your order ${student.orderCode || student.trackingId}`;
  const html = `
    <div style="font-family:Arial,sans-serif; color:#111827; line-height:1.6;">
      <h2 style="margin-bottom:12px;">Hello ${student.name},</h2>
      <p>We have received your order and it is being processed. We will notify you when it has been dispatched.</p>
      <p><strong>Tracking ID:</strong> ${student.trackingId}</p>
      <p><strong>Order Code:</strong> ${student.orderCode || 'N/A'}</p>
      <table style="border-collapse:collapse; width:100%; margin-top:16px;">
        <thead>
          <tr>
            <th style="padding:8px 12px; border:1px solid #e5e7eb; background:#f3f4f6; text-align:left;">Book Code</th>
            <th style="padding:8px 12px; border:1px solid #e5e7eb; background:#f3f4f6; text-align:left;">Book Name</th>
            <th style="padding:8px 12px; border:1px solid #e5e7eb; background:#f3f4f6; text-align:center;">Required</th>
            <th style="padding:8px 12px; border:1px solid #e5e7eb; background:#f3f4f6; text-align:center;">Dispatched so far</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p style="margin-top:18px;">Thank you.</p>
    </div>
  `;
  const text = `Hello ${student.name},\n\nWe have received your order ${student.orderCode || student.trackingId} and it is being processed.\nTracking ID: ${student.trackingId}\n\nItems:\n${items
    .map((item) => `${item.bookCode} - ${item.bookName} (${item.requiredQuantity} required, ${item.dispatchedQuantity} dispatched)`)
    .join('\n')}`;

  // 1. Resend HTTP REST API (bypasses Render SMTP port blocks)
  if (resendClient) {
    const from = ENV.SMTP_FROM && !ENV.SMTP_FROM.includes('fastdispatch.in') && !ENV.SMTP_FROM.includes('AAPKI')
      ? ENV.SMTP_FROM
      : 'FAST DISPATCH PRO <onboarding@resend.dev>';

    try {
      const response = await resendClient.emails.send({
        from,
        to: student.email,
        subject,
        html,
        text,
      });

      if (response.error) {
        console.error(`[EMAIL] Resend API rejected message for ${student.email}:`, response.error);
        return { sent: false, reason: response.error.message || 'RESEND_REJECTED' };
      }

      console.info(`[EMAIL] Resend API sent email to ${student.email} (id: ${response.data?.id})`);
      return { sent: true, messageId: response.data?.id, fallback: false };
    } catch (err: any) {
      console.error(`[EMAIL] Resend exception for ${student.email}:`, err);
      return { sent: false, reason: err.message || 'RESEND_EXCEPTION' };
    }
  }

  // 2. SMTP fallback (for local development)
  if (smtpTransporter) {
    const fromAddress = ENV.SMTP_FROM || ENV.SMTP_USER || 'noreply@fastdispatch.in';
    const info = await smtpTransporter.sendMail({
      from: fromAddress,
      to: student.email,
      subject,
      html,
      text,
    });
    return { sent: true, messageId: info.messageId, fallback: false };
  }

  return { sent: false, reason: 'NO_ACTIVE_TRANSPORT' };
}
