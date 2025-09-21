require('dotenv').config();
const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const {
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  RESEND_API_KEY
} = process.env;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn('[sendEmail] EMAIL_USER or EMAIL_PASS is not set. Email sending may fail unless Resend is configured.');
}

const transporterConfig = SMTP_HOST
  ? {
      host: SMTP_HOST,
      port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
      secure: SMTP_SECURE === 'true',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      connectionTimeout: 10000,
      socketTimeout: 10000
    }
  : {
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      connectionTimeout: 10000,
      socketTimeout: 10000
    };

let transporter = null;
try {
  transporter = nodemailer.createTransport(transporterConfig);
} catch (e) {
  console.warn('[sendEmail] Failed to create nodemailer transporter:', e.message || e);
  transporter = null;
}

let resendClient = null;
if (RESEND_API_KEY) {
  try {
    resendClient = new Resend(RESEND_API_KEY);
  } catch (e) {
    console.warn('[sendEmail] Failed to init Resend client:', e.message || e);
    resendClient = null;
  }
}

async function sendEmail(to, subject, text, html) {
  if (resendClient) {
    try {
      const from = EMAIL_FROM || EMAIL_USER || 'no-reply@yourapp.com';
      const res = await resendClient.emails.send({
        from,
        to,
        subject,
        html: html || undefined,
        text: text || undefined,
      });
      console.log('[sendEmail] Sent via Resend:', res?.id || res);
      return res;
    } catch (resErr) {
      console.error('[sendEmail] Resend send failed:', resErr.message || resErr);
    }
  }

  // fallback: Nodemailer
  try {
    if (!transporter) {
      const fake = { messageId: 'dev-fake-id', accepted: [to] };
      console.warn('[sendEmail] transporter not available; returning fake response in dev.');
      return fake;
    }

    try {
      await transporter.verify();
    } catch (verifyErr) {
      console.warn('[sendEmail] transporter verify failed:', verifyErr.message || verifyErr);
    }

    const info = await transporter.sendMail({
      from: EMAIL_FROM || EMAIL_USER,
      to,
      subject,
      text,
      html,
    });

    console.log('[sendEmail] Email sent (nodemailer):', info?.messageId || info);
    return info;
  } catch (err) {
    console.error('[sendEmail] Failed to send email (nodemailer):', err.message || err);
    throw err;
  }
}

module.exports = sendEmail;
