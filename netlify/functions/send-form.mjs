// Website form handler: receives the four lead forms and emails each submission through your own SMTP server.
// Served at /api/send-form (see `config` at the bottom). Replaces Netlify Forms.
//
// Set these in Netlify (Site configuration > Environment variables). Never commit them.
//   SMTP_HOST        SMTP server, e.g. smtp.office365.com, smtp.gmail.com, smtp-relay.brevo.com
//   SMTP_PORT        587 (STARTTLS, default) or 465 (TLS)
//   SMTP_SECURE      Optional: "true" for TLS from the start on a port other than 465
//   SMTP_USER        SMTP login (usually the sender mailbox)
//   SMTP_PASS        SMTP password or app password (mark it "Secret" in Netlify)
//   MAIL_FROM        Sender shown on the email, e.g. "IME Website <web@cadcam.com.my>" (defaults to SMTP_USER)
//   MAIL_TO          Recipients, comma-separated
//   MAIL_BCC         Optional hidden copies, comma-separated
//   MAX_UPLOAD_MB    Optional CAD attachment limit in MB (default 4; Netlify caps a request at about 6 MB)
//   ALLOWED_ORIGINS  Optional extra origins allowed to post, comma-separated (the site's own domain is always allowed)
// The WhatsApp alert (netlify/lib/whatsapp.mjs) also runs for each lead when its own variables are set.

import nodemailer from 'nodemailer';
import { sendWhatsAppAlert } from '../lib/whatsapp.mjs';

const FORMS = {
  enquiry: 'General enquiry',
  'amic-visit': 'AMIC',
  'software-licensing': 'Materialise software',
  'printer-pricing': 'Printer pricing',
};
const LABELS = {
  'inquiry-type': 'Enquiry type', name: 'Name', company: 'Company', email: 'Email',
  phone: 'Phone / WhatsApp', interest: 'Interested in', message: 'Message', page: 'Page',
};
const SKIP = new Set(['form-name', 'bot-field', 'pdpa-consent']);
const FILE_EXT = /\.(step|stp|stl|3mf|obj|iges|igs)$/i;
const MAX_FIELDS = 40, MAX_VALUE = 5000, MAX_FILES = 3;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s, max) => String(s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const label = (k) => LABELS[k] || k.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

let transport;
function getTransport(env) {
  if (!transport) {
    const port = Number(env.SMTP_PORT || 587);
    const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST, port, secure,
      requireTLS: !secure, // never send credentials or leads over an unencrypted connection
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
    });
  }
  return transport;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  const env = process.env;

  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_TO'].filter((k) => !env[k]);
  if (missing.length) {
    console.error('send-form: missing environment variables:', missing.join(', '));
    return json(500, { ok: false, error: 'The form is not set up yet' });
  }

  // Only accept posts from this site's own pages (and any extra origins listed)
  const origin = req.headers.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch {}
    if (host !== new URL(req.url).host && !list(env.ALLOWED_ORIGINS).includes(origin)) {
      return json(403, { ok: false, error: 'Forbidden' });
    }
  }

  const maxBytes = Math.max(1, Number(env.MAX_UPLOAD_MB) || 4) * 1024 * 1024;
  if (Number(req.headers.get('content-length') || 0) > maxBytes + 64 * 1024) {
    return json(413, { ok: false, error: `The attachment is too large (max ${maxBytes / 1048576} MB)` });
  }

  let fd;
  try { fd = await req.formData(); } catch { return json(400, { ok: false, error: 'Invalid form data' }); }

  // Honeypot: bots fill the hidden field. Pretend success and send nothing.
  if (String(fd.get('bot-field') || '').trim()) return json(200, { ok: true });

  const form = String(fd.get('form-name') || '');
  if (!FORMS[form]) return json(400, { ok: false, error: 'Unknown form' });

  const name = oneLine(fd.get('name') || '', 120);
  const email = oneLine(fd.get('email') || '', 254);
  if (!name) return json(400, { ok: false, error: 'Please enter your name' });
  if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(email)) return json(400, { ok: false, error: 'Please enter a valid email address' });
  if (fd.get('pdpa-consent') !== 'yes') return json(400, { ok: false, error: 'Please tick the consent box' });

  const rows = [], attachments = [];
  let total = 0;
  for (const [k, v] of fd) {
    if (SKIP.has(k)) continue;
    if (typeof v !== 'string') {
      if (!v.size) continue;
      if (attachments.length >= MAX_FILES) return json(400, { ok: false, error: 'Too many files' });
      if (!FILE_EXT.test(v.name)) return json(400, { ok: false, error: 'Please attach a STEP, STP, STL, 3MF, OBJ or IGES file' });
      total += v.size;
      if (total > maxBytes) return json(413, { ok: false, error: `The attachment is too large (max ${maxBytes / 1048576} MB)` });
      attachments.push({
        filename: v.name.replace(/[^\w.\- ]+/g, '_').slice(-120),
        content: Buffer.from(await v.arrayBuffer()),
        contentType: 'application/octet-stream',
      });
      continue;
    }
    const val = v.trim().slice(0, MAX_VALUE);
    if (val && rows.length < MAX_FIELDS) rows.push([label(k), val]);
  }

  const data = Object.fromEntries([...fd].filter(([, v]) => typeof v === 'string'));
  const type = oneLine(data['inquiry-type'] || FORMS[form], 100);
  const company = oneLine(data.company || '', 120);
  const subject = oneLine(`Website lead: ${type} from ${name}${company ? ` (${company})` : ''}`, 200);

  const text = `New enquiry from the IME Additive Manufacturing website\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`
    + (attachments.length ? `\n\nAttached: ${attachments.map((a) => a.filename).join(', ')}` : '')
    + '\n\nReply to this email to answer the customer directly.';
  const html = `<p>New enquiry from the IME Additive Manufacturing website</p>
<table cellpadding="6" style="border-collapse:collapse;font:14px/1.45 Arial,sans-serif">${rows.map(([k, v]) =>
    `<tr><th align="left" valign="top" style="border-bottom:1px solid #ddd;white-space:nowrap">${esc(k)}</th><td style="border-bottom:1px solid #ddd;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
${attachments.length ? `<p>Attached: ${attachments.map((a) => esc(a.filename)).join(', ')}</p>` : ''}<p style="color:#666">Reply to this email to answer the customer directly.</p>`;

  try {
    await getTransport(env).sendMail({
      from: env.MAIL_FROM || env.SMTP_USER,
      to: list(env.MAIL_TO),
      bcc: list(env.MAIL_BCC),
      replyTo: { name, address: email },
      subject, text, html, attachments,
    });
  } catch (err) {
    console.error('send-form: SMTP send failed:', err && (err.code || err.message));
    return json(502, { ok: false, error: 'The message could not be sent' });
  }

  await sendWhatsAppAlert({ ...data, form });
  return json(200, { ok: true });
};

export const config = { path: '/api/send-form' };
