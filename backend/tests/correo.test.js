// US-009: proveedor de correo Brevo. No sale a la red: fetch se reemplaza por
// un doble que registra la solicitud y devuelve la respuesta que se le indique.
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.CORREO_PROVEEDOR = 'brevo';
process.env.BREVO_API_KEY = 'xkeysib-clave-de-prueba-0123456789';
process.env.CORREO_REMITENTE = 'SAGE Colegio <pagos@colegio.pe>';

const fetchOriginal = globalThis.fetch;
let solicitudes = [];
let respuesta = { status: 201, cuerpo: { messageId: '<id-brevo@smtp-relay.mailin.fr>' } };
let correo;

before(async () => {
  globalThis.fetch = async (url, opciones) => {
    solicitudes.push({ url, opciones, cuerpo: JSON.parse(opciones.body) });
    return new Response(JSON.stringify(respuesta.cuerpo), {
      status: respuesta.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  correo = await import('../src/integrations/correo.js');
});
after(() => {
  globalThis.fetch = fetchOriginal;
});
beforeEach(() => {
  solicitudes = [];
  respuesta = { status: 201, cuerpo: { messageId: '<id-brevo@smtp-relay.mailin.fr>' } };
});

const mensaje = () => ({
  para: 'familia@correo.pe',
  asunto: 'Comprobante de pago B001-00000012 — SAGE',
  texto: 'Adjuntamos el comprobante.',
  adjuntos: [
    {
      nombre: 'comprobante-B001-00000012.pdf',
      contenido: Buffer.from('%PDF-1.4 prueba'),
      tipo: 'application/pdf',
    },
  ],
});

test('COR-01: separa el nombre y el correo del remitente', () => {
  assert.deepEqual(correo.separarRemitente('SAGE Colegio <pagos@colegio.pe>'), {
    name: 'SAGE Colegio',
    email: 'pagos@colegio.pe',
  });
  assert.deepEqual(correo.separarRemitente('"SAGE" <pagos@colegio.pe>'), {
    name: 'SAGE',
    email: 'pagos@colegio.pe',
  });
  assert.deepEqual(correo.separarRemitente('pagos@colegio.pe'), { email: 'pagos@colegio.pe' });
});

test('COR-02: envía a la API de Brevo con la clave, el remitente y el PDF en base64', async () => {
  const resultado = await correo.enviarCorreo(mensaje());
  assert.equal(resultado.idMensaje, '<id-brevo@smtp-relay.mailin.fr>');
  assert.equal(correo.correoSimulado, false);
  assert.equal(solicitudes.length, 1);
  const [{ url, opciones, cuerpo }] = solicitudes;
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(opciones.method, 'POST');
  assert.equal(opciones.headers['api-key'], 'xkeysib-clave-de-prueba-0123456789');
  assert.deepEqual(cuerpo.sender, { name: 'SAGE Colegio', email: 'pagos@colegio.pe' });
  assert.deepEqual(cuerpo.to, [{ email: 'familia@correo.pe' }]);
  assert.equal(cuerpo.subject, 'Comprobante de pago B001-00000012 — SAGE');
  assert.equal(cuerpo.textContent, 'Adjuntamos el comprobante.');
  assert.deepEqual(cuerpo.attachment, [
    {
      name: 'comprobante-B001-00000012.pdf',
      content: Buffer.from('%PDF-1.4 prueba').toString('base64'),
    },
  ]);
});

test('COR-03: un rechazo de Brevo se convierte en error con su código y mensaje', async () => {
  respuesta = {
    status: 400,
    cuerpo: { code: 'invalid_parameter', message: 'sender is not valid' },
  };
  await assert.rejects(
    correo.enviarCorreo(mensaje()),
    /Brevo respondió 400: invalid_parameter sender is not valid/,
  );
  respuesta = { status: 401, cuerpo: { code: 'unauthorized', message: 'Key not found' } };
  await assert.rejects(correo.enviarCorreo(mensaje()), /401: unauthorized Key not found/);
});
