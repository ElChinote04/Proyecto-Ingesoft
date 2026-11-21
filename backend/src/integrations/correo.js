// Envío de correos (US-009: reenviar el comprobante de pago).
// Mismo criterio que la pasarela de pagos: un proveedor 'simulado' para
// desarrollar y probar sin red ni credenciales, y uno real ('smtp').
//   - simulado: no sale a la red; guarda los mensajes en memoria (las pruebas
//     los inspeccionan) y deja constancia en el log.
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

const proveedor = env.CORREO_PROVEEDOR === 'smtp' ? smtp : simulado;

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
