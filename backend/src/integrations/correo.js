// Envío de correos (US-009: reenviar el comprobante de pago).
// Mismo criterio que la pasarela de pagos: un proveedor 'simulado' para
// desarrollar y probar sin red ni credenciales, y proveedores reales.
//   - simulado: no sale a la red; guarda los mensajes en memoria (las pruebas
//     los inspeccionan) y deja constancia en el log.
//   - brevo:    envía con la API transaccional de Brevo (BREVO_API_KEY). Usa
//     HTTPS, así que funciona aunque la red bloquee los puertos SMTP.
//   - smtp:     envía con el servidor configurado en SMTP_* (Gmail, Outlook, SES…).
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

const LIMITE_SIMULADOS = 50;

export const simulado = {
  enviados: [],
  /** Hace que el siguiente envío falle, para probar el manejo del error. */
  fallarSiguiente: false,
  reiniciar() {
    this.enviados = [];
    this.fallarSiguiente = false;
  },
  async enviar(mensaje) {
    if (this.fallarSiguiente) {
      this.fallarSiguiente = false;
      throw new Error('Fallo simulado del servidor de correo');
    }
    this.enviados.push(mensaje);
    if (this.enviados.length > LIMITE_SIMULADOS) this.enviados.shift();
    logger.info('CORREO_SIMULADO', {
      module: 'correo',
      para: mensaje.to,
      asunto: mensaje.subject,
      adjuntos: (mensaje.attachments ?? []).map((a) => a.filename),
    });
    return { idMensaje: `simulado-${this.enviados.length}` };
  },
};

let transporte;
const smtp = {
  async enviar(mensaje) {
    transporte ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USUARIO ? { user: env.SMTP_USUARIO, pass: env.SMTP_CLAVE } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    const info = await transporte.sendMail(mensaje);
    return { idMensaje: info.messageId };
  },
};

/** "SAGE <no-responder@colegio.pe>" → { name: 'SAGE', email: 'no-responder@colegio.pe' } */
export function separarRemitente(remitente) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(remitente);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: remitente.trim() };
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
export const brevo = {
  async enviar(mensaje) {
    const cuerpo = {
      sender: separarRemitente(mensaje.from),
      to: [{ email: mensaje.to }],
      subject: mensaje.subject,
      ...(mensaje.html ? { htmlContent: mensaje.html } : { textContent: mensaje.text }),
      ...(mensaje.attachments?.length && {
        attachment: mensaje.attachments.map((a) => ({
          name: a.filename,
          content: Buffer.from(a.content).toString('base64'),
        })),
      }),
    };
    const respuesta = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok)
      // Brevo responde { code, message }; el mensaje explica, por ejemplo, un
      // remitente sin validar o una clave inválida. Va al log, no al usuario.
      throw new Error(
        `Brevo respondió ${respuesta.status}: ${datos.code ?? ''} ${datos.message ?? ''}`.trim(),
      );
    return { idMensaje: datos.messageId ?? null };
  },
};

const proveedores = { simulado, brevo, smtp };
const proveedor = proveedores[env.CORREO_PROVEEDOR];

/** true cuando el envío no sale a la red: la pantalla lo avisa. */
export const correoSimulado = env.CORREO_PROVEEDOR === 'simulado';

/** Envía un correo. `adjuntos`: [{ nombre, contenido (Buffer), tipo }]. */
export function enviarCorreo({ para, asunto, texto, html, adjuntos = [] }) {
  return proveedor.enviar({
    from: env.CORREO_REMITENTE,
    to: para,
    subject: asunto,
    text: texto,
    html,
    attachments: adjuntos.map((a) => ({
      filename: a.nombre,
      content: a.contenido,
      contentType: a.tipo,
    })),
  });
}
