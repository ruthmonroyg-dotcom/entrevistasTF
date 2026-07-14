import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logosDir = path.join(__dirname, '..', '..', 'assets', 'logos');

const sendgridApiKey = process.env.SENDGRID_API_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
const fromEmail = process.env.FROM_EMAIL || gmailUser || 'entrevistas@ucab.edu.ve';
const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

// SendGrid envía por HTTPS (funciona en hostings como Render, que bloquean SMTP saliente).
// Gmail SMTP solo funciona en redes que no bloqueen los puertos 465/587 (ej. en local).
if (sendgridApiKey) sgMail.setApiKey(sendgridApiKey);
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const gmailTransport = (gmailUser && gmailAppPassword)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailAppPassword },
    })
  : null;

// Logos alineados en la parte superior de cada correo: IATF, UCAB, INVEDIN,
// 2cm de separación entre cada uno, centrados al ancho del contenido.
// Altura base 32px (para que quepan en los 560px de ancho del correo); IATF +20% y luego +40% adicional, UCAB igual, INVEDIN -5%.
const BASE_LOGO_HEIGHT = 32;
const LOGO_ORDER = [
  { base: 'iatf', cid: 'logo-iatf', alt: 'Instituto Atlántico de Terapia Familiar', height: BASE_LOGO_HEIGHT * 1.2 * 1.4 },
  { base: 'ucab', cid: 'logo-ucab', alt: 'Universidad Católica Andrés Bello', height: BASE_LOGO_HEIGHT },
  { base: 'invedin', cid: 'logo-invedin', alt: 'INVEDIN', height: BASE_LOGO_HEIGHT * 0.95 },
];
const LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function availableLogos() {
  return LOGO_ORDER
    .map((logo) => {
      const ext = LOGO_EXTENSIONS.find((e) => fs.existsSync(path.join(logosDir, logo.base + e)));
      return ext ? { ...logo, file: logo.base + ext } : null;
    })
    .filter(Boolean);
}

function logosHeaderHtml() {
  const logos = availableLogos();
  if (logos.length === 0) return '';
  const cells = logos
    .map((logo, i) => {
      const spacer = i > 0 ? '<td style="width: 2cm;"></td>' : '';
      return `${spacer}<td><img src="cid:${logo.cid}" alt="${escapeHtml(logo.alt)}" height="${logo.height}" style="display:block;height:${logo.height}px;width:auto;" /></td>`;
    })
    .join('');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px;">
      <tr>${cells}</tr>
    </table>
  `;
}

function logosAttachments() {
  return availableLogos().map((logo) => ({
    filename: logo.file,
    path: path.join(logosDir, logo.file),
    cid: logo.cid,
  }));
}

const MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
let cachedSendgridAttachments = null;
function logosAttachmentsBase64() {
  if (cachedSendgridAttachments) return cachedSendgridAttachments;
  cachedSendgridAttachments = availableLogos().map((logo) => ({
    content: fs.readFileSync(path.join(logosDir, logo.file)).toString('base64'),
    filename: logo.file,
    type: MIME_TYPES[path.extname(logo.file)] || 'application/octet-stream',
    disposition: 'inline',
    content_id: logo.cid,
  }));
  return cachedSendgridAttachments;
}

async function send({ to, subject, html }) {
  // Prioridad: SendGrid (HTTPS, funciona en Render) > Gmail SMTP (solo en redes sin bloqueo) > Resend > simulado.
  if (sendgridApiKey) {
    return sgMail.send({
      to,
      from: { email: fromEmail, name: 'UCAB — Formación en Terapia de Familia' },
      subject,
      html,
      attachments: logosAttachmentsBase64(),
    });
  }
  if (gmailTransport) {
    return gmailTransport.sendMail({
      from: `"UCAB — Formación en Terapia de Familia" <${gmailUser}>`,
      to,
      subject,
      html,
      attachments: logosAttachments(),
    });
  }
  if (resend) {
    return resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      attachments: logosAttachments().map((a) => ({
        filename: a.filename,
        path: a.path,
        content_id: a.cid,
      })),
    });
  }
  console.log('\n[EMAIL SIMULADO] (configura SENDGRID_API_KEY, GMAIL_USER/GMAIL_APP_PASSWORD o RESEND_API_KEY en server/.env para enviar de verdad)');
  console.log('Para:', to);
  console.log('Asunto:', subject);
  console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  console.log('');
  return { simulated: true };
}

export function sendInvitationEmail({ name, email, token }) {
  const link = `${appBaseUrl}/agendar/${token}`;
  const subject = 'UCAB — Agenda tu entrevista para la Formación en Terapia de Familia';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #222;">
      ${logosHeaderHtml()}
      <h2>Formación en Terapia de Familia — UCAB</h2>
      <p>Hola ${escapeHtml(name)},</p>
      <p>Como parte del proceso de selección para la Formación en Terapia de Familia, te invitamos a agendar tu entrevista virtual (30 minutos, por Zoom).</p>
      <p>
        <a href="${link}" style="background:#003876;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          Elegir día y horario
        </a>
      </p>
      <p>Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
        <a href="${link}">${link}</a>
      </p>
      <p>Este enlace es personal e intransferible.</p>
      <p>Saludos,<br/>Equipo de Formación — UCAB</p>
    </div>
  `;
  return send({ to: email, subject, html });
}

export function sendZoomConfirmationEmail({ name, email, date, startTime, endTime, zoomLink, zoomMeetingId, zoomPassword }) {
  const subject = 'UCAB — Confirmación de entrevista: coordenadas de Zoom';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #222;">
      ${logosHeaderHtml()}
      <h2>Entrevista confirmada</h2>
      <p>Hola ${escapeHtml(name)},</p>
      <p>Confirmamos tu entrevista para la Formación en Terapia de Familia:</p>
      <ul>
        <li><strong>Fecha:</strong> ${formatDate(date)}</li>
        <li><strong>Hora:</strong> ${startTime} - ${endTime}</li>
        <li><strong>Enlace Zoom:</strong> <a href="${zoomLink}">${zoomLink}</a></li>
        ${zoomMeetingId ? `<li><strong>ID de reunión:</strong> ${escapeHtml(zoomMeetingId)}</li>` : ''}
        ${zoomPassword ? `<li><strong>Contraseña:</strong> ${escapeHtml(zoomPassword)}</li>` : ''}
      </ul>
      <p>Por favor conéctate 5 minutos antes de la hora indicada.</p>
      <p>Saludos,<br/>Equipo de Formación — UCAB</p>
    </div>
  `;
  return send({ to: email, subject, html });
}

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
