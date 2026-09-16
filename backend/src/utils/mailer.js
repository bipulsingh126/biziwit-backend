import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load backend/.env (relative to this file: ../../.env)
const backendEnvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}

// 2. Load root .env as fallback (../../../.env)
const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

// 3. Also load from current working directory as safety net
dotenv.config();

let cachedTransporter = null;

/**
 * Creates and returns the nodemailer SMTP transporter.
 */
export function getTransporter() {
  // Re-check env vars in case they were set/modified dynamically
  const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = (process.env.SMTP_USER || '').trim();
  // Strip potential wrapping quotes from password in .env
  const rawPass = (process.env.SMTP_PASS || '').trim();
  const pass = rawPass.replace(/^["']|["']$/g, '');
  const secure = String(process.env.SMTP_SECURE ?? (port === 465)).toLowerCase() === 'true' || port === 465;

  if (!host || !user || !pass) {
    console.warn('⚠️ [SMTP] Transporter not initialized: SMTP_HOST, SMTP_USER, or SMTP_PASS missing in process.env.');
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
    host,
    port,
    secure, // true for 465 (implicit TLS/SSL), false for 587 (STARTTLS)
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  return cachedTransporter;
}

export const transporter = getTransporter();

/**
 * Verifies SMTP connection and authentication at startup.
 * Logs clear success or detailed failure diagnostics.
 */
export async function verifyTransporter() {
  const currentTransporter = getTransporter();
  if (!currentTransporter) {
    console.warn('⚠️ [SMTP] Transporter not initialized: SMTP_HOST, SMTP_USER, or SMTP_PASS missing in environment.');
    return false;
  }

  try {
    const success = await currentTransporter.verify();
    console.log(`✅ [SMTP] Connected & verified successfully with ${process.env.SMTP_HOST || 'smtp.hostinger.com'}:${process.env.SMTP_PORT || 465} (${process.env.SMTP_USER})`);
    return true;
  } catch (err) {
    console.error('❌ [SMTP] Connection verification failed:');
    console.error({
      code: err.code,
      responseCode: err.responseCode,
      response: err.response,
      command: err.command,
      message: err.message,
    });
    return false;
  }
}

/**
 * Sanitizes and validates the sender ('From') email address.
 * Strictly prevents Hostinger SMTP 450/553 errors by stripping placeholder or unresolvable
 * domains (like .local, yourdomain.com, example.com) and ensuring a valid authenticated sender.
 * 
 * @param {string} [overrideFrom]
 * @returns {string} Sanitized 'From' address formatted as `"Bizwit Research" <user@domain.com>`
 */
export function getSenderAddress(overrideFrom) {
  const defaultMailbox = (process.env.SMTP_USER || 'contact@bizwitresearch.com').trim();
  const fallback = `"Bizwit Research" <${defaultMailbox}>`;
  const candidate = overrideFrom || process.env.MAIL_FROM;

  if (!candidate || typeof candidate !== 'string') {
    return fallback;
  }

  const trimmed = candidate.trim().replace(/^["']|["']$/g, '');
  const lower = trimmed.toLowerCase();

  // Detect unresolvable/dummy domains that cause Hostinger SMTP to reject
  const isInvalid =
    lower.includes('.local') ||
    lower.includes('yourdomain.com') ||
    lower.includes('example.com') ||
    lower.includes('biziwit.local') ||
    lower.includes('test.com') ||
    !lower.includes('@');

  if (isInvalid) {
    console.warn(`⚠️ [SMTP] Rejected invalid/placeholder MAIL_FROM: "${trimmed}". Falling back to: ${fallback}`);
    return fallback;
  }

  // If candidate is just an email (e.g. contact@bizwitresearch.com)
  if (!trimmed.includes('<') && trimmed.includes('@')) {
    return `"Bizwit Research" <${trimmed}>`;
  }

  return trimmed;
}

/**
 * Sends an email with full diagnostic logging on error.
 * 
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject line
 * @param {string} [options.html] - HTML email body
 * @param {string} [options.text] - Plain text email body
 * @param {string} [options.from] - Sender address override
 * @param {string} [options.replyTo] - Reply-To address
 * @param {Array} [options.attachments] - Optional attachments
 * @returns {Promise<{success: boolean, messageId?: string, response?: string, error?: any}>}
 */
export async function sendMail({ to, subject, html, text, from, replyTo, attachments }) {
  const currentTransporter = getTransporter();

  if (!currentTransporter) {
    const errorMsg = 'SMTP credentials not configured. Email will not be sent.';
    console.warn(`⚠️ [SMTP] ${errorMsg}`);
    return { success: false, error: new Error(errorMsg) };
  }

  // Ensure recipient is clean
  const cleanTo = Array.isArray(to)
    ? to.map((e) => (typeof e === 'string' ? e.trim() : '')).filter(Boolean)
    : (typeof to === 'string' ? to.trim() : '');

  if (!cleanTo || (Array.isArray(cleanTo) && cleanTo.length === 0)) {
    const errorMsg = 'No valid recipient specified for sendMail.';
    console.error(`❌ [SMTP] ${errorMsg}`);
    return { success: false, error: new Error(errorMsg) };
  }

  const safeFrom = getSenderAddress(from);
  const mailOptions = {
    from: safeFrom,
    to: cleanTo,
    subject: subject || 'Bizwit Research Notification',
    text,
    html,
    replyTo: replyTo || undefined,
    attachments: attachments || undefined,
  };

  try {
    const info = await currentTransporter.sendMail(mailOptions);
    console.log(`📧 [SMTP] Email sent successfully to [${Array.isArray(cleanTo) ? cleanTo.join(', ') : cleanTo}] | MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (err) {
    console.error('❌ [SMTP] Failed to send email:');
    console.error({
      recipient: cleanTo,
      from: safeFrom,
      subject,
      code: err.code,
      responseCode: err.responseCode,
      response: err.response,
      command: err.command,
      message: err.message,
    });
    return { success: false, error: err };
  }
}

export default {
  transporter,
  verifyTransporter,
  sendMail,
  getSenderAddress,
};
