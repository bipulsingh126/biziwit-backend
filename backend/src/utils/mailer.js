import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Creates and returns the nodemailer SMTP transporter.
 */
function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const secure = String(process.env.SMTP_SECURE || 'true') === 'true' || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure, // true for 465 (implicit TLS/SSL), false for other ports (587 STARTTLS)
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

const transporter = createTransporter();

/**
 * Verifies SMTP connection and authentication at startup.
 * Logs clear success or detailed failure diagnostics.
 */
export async function verifyTransporter() {
  const currentTransporter = transporter || createTransporter();
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
  const currentTransporter = transporter || createTransporter();

  if (!currentTransporter) {
    const errorMsg = 'SMTP credentials not configured. Email will not be sent.';
    console.warn(`⚠️ [SMTP] ${errorMsg}`);
    return { success: false, error: new Error(errorMsg) };
  }

  const defaultFrom = process.env.MAIL_FROM || `"Bizwit Research" <${process.env.SMTP_USER || 'contact@bizwitresearch.com'}>`;
  const mailOptions = {
    from: from || defaultFrom,
    to,
    subject,
    text,
    html,
    replyTo: replyTo || undefined,
    attachments: attachments || undefined,
  };

  try {
    const info = await currentTransporter.sendMail(mailOptions);
    console.log(`📧 [SMTP] Email sent successfully to [${Array.isArray(to) ? to.join(', ') : to}] | MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (err) {
    console.error('❌ [SMTP] Failed to send email:');
    console.error({
      recipient: to,
      subject,
      code: err.code,
      responseCode: err.responseCode,
      response: err.response,
      command: err.command,
      message: err.message,
      stack: err.stack,
    });
    return { success: false, error: err };
  }
}

export default {
  transporter,
  verifyTransporter,
  sendMail,
};
