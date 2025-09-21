
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

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn('[sendEmail] EMAIL_USER or EMAIL_PASS is not set. Email sending will fail until these are provided.');
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

let ResendLib = null;
if (RESEND_API_KEY) {
  try {
    const imported = require('resend');
    ResendLib = imported.default || imported;
  } catch (e) {
    console.warn('[sendEmail] Resend library not available despite RESEND_API_KEY being set:', e && e.message ? e.message : e);
    ResendLib = null;
  }
}

let transporter = null;
try {
  transporter = nodemailer.createTransport(transporterConfig);
} catch (e) {
  console.warn('[sendEmail] Failed to create nodemailer transporter:', e && e.message ? e.message : e);
  transporter = null;
}

async function sendEmail(to, subject, text, html) {
  if (RESEND_API_KEY && ResendLib) {
    try {
      const resend = new ResendLib(RESEND_API_KEY);
      const from = EMAIL_FROM || EMAIL_USER;
      const payload = {
        from,
        to,
        subject,
      };
      if (html) payload.html = html;
      else payload.text = text;

      const res = await resend.emails.send(payload);
      console.log('[sendEmail] Sent via Resend:', res && res.id ? res.id : res);
      return res;
    } catch (resErr) {
      console.error('[sendEmail] Resend send failed:', resErr && resErr.message ? resErr.message : resErr);
    }
  }

  try {
    if (!transporter) {
      // In development, don't throw hard; log and return a fake response so callers can proceed
      const fake = { messageId: 'dev-fake-id', accepted: [to] };
      console.warn('[sendEmail] transporter not available; returning fake response in dev.');
      return fake;
    }

    try {
      await transporter.verify();
    } catch (verifyErr) {
      console.warn('[sendEmail] transporter verify failed:', verifyErr && verifyErr.message ? verifyErr.message : verifyErr);
      // continue and attempt send; some transports may not require verify
    }

    const info = await transporter.sendMail({
      from: EMAIL_FROM || EMAIL_USER,
      to,
      subject,
      text,
      html
    });

    console.log('[sendEmail] Email sent (nodemailer):', info && info.messageId ? info.messageId : info);
    return info;
  } catch (err) {
    console.error('[sendEmail] Failed to send email (nodemailer):', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = sendEmail;
