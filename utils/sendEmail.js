require('dotenv').config();
const nodemailer = require('nodemailer');

const {
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  RESEND_API_KEY
} = process.env;

// Validate essential environment variables
if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn('[sendEmail] WARNING: EMAIL_USER or EMAIL_PASS is not set.');
}

// Nodemailer configuration
const transporterConfig = SMTP_HOST
  ? {
      host: SMTP_HOST,
      port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
      secure: SMTP_SECURE === 'true',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      connectionTimeout: 30000, // 30s
      socketTimeout: 30000
    }
  : {
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      connectionTimeout: 30000,
      socketTimeout: 30000
    };

let ResendLib = null;
if (RESEND_API_KEY) {
  try {
    const imported = require('resend');
    // Some versions use default export
    ResendLib = imported.default || imported;
  } catch (e) {
    console.warn('[sendEmail] Resend library not available:', e.message || e);
    ResendLib = null;
  }
}

const transporter = nodemailer.createTransport(transporterConfig);

async function sendEmail(to, subject, text, html) {
  // Attempt sending via Resend API first if configured
  if (RESEND_API_KEY && ResendLib) {
    try {
      const resend = new ResendLib(RESEND_API_KEY);
      const from = EMAIL_FROM || EMAIL_USER;
      const payload = { from, to, subject };
      if (html) payload.html = html;
      else payload.text = text;

      const res = await resend.emails.send(payload);
      console.log('[sendEmail] Sent via Resend:', res && res.id ? res.id : res);
      return res;
    } catch (resErr) {
      console.error('[sendEmail] Resend send failed:', resErr);
      // fallback to Nodemailer
    }
  }

  // Nodemailer fallback
  try {
    try {
      await transporter.verify();
      console.log('[sendEmail] SMTP transporter verified successfully');
    } catch (verifyErr) {
      console.warn('[sendEmail] transporter verification warning:', verifyErr);
    }

    const info = await transporter.sendMail({
      from: EMAIL_FROM || EMAIL_USER,
      to,
      subject,
      text,
      html
    });

    console.log('[sendEmail] Email sent via Nodemailer:', info && info.messageId ? info.messageId : info);
    return info;
  } catch (err) {
    console.error('[sendEmail] Failed to send email (Nodemailer):', err);
    // Instead of crashing, return a descriptive object
    return { error: true, message: 'Failed to send email', details: err.message || err };
  }
}

module.exports = sendEmail;
