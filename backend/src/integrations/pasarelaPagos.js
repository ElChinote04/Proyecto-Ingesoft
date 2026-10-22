// Adaptador de la pasarela de pagos (ADR-002 del Documento de Arquitectura).
// Es el único componente que conoce la API del proveedor: el resto del sistema
// habla con él mediante crearIntento, consultarIntento y verificarNotificacion,
// y recibe estados del dominio de SAGE, no del proveedor.
//
// Hay dos implementaciones de la misma interfaz:
//   - stripe:    integración real contra Stripe Checkout en modo de prueba.
//   - simulada:  proveedor en memoria, para pruebas automatizadas y para
//                desarrollar sin credenciales. No procesa dinero.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { aCentimos } from '../domain/cronograma.js';

const API = 'https://api.stripe.com/v1';
const TOLERANCIA_FIRMA_SEGUNDOS = 300;

/** Estados del proveedor traducidos al vocabulario de SAGE. */
export const RESULTADO = {
  PAGADO: 'PAGADO',
  PENDIENTE: 'PENDIENTE',
  RECHAZADO: 'RECHAZADO',
  EXPIRADO: 'EXPIRADO',
};

const noDisponible = (detalle) =>
  new AppError(
    503,
    'PASARELA_NO_DISPONIBLE',
    'No pudimos comunicarnos con la pasarela de pagos. Vuelve a intentarlo en unos minutos.',
    detalle,
  );

// --------------------------------------------------------------- Stripe
function cuerpoFormulario(objeto, prefijo = '', destino = new URLSearchParams()) {
  for (const [clave, valor] of Object.entries(objeto)) {
    if (valor === undefined || valor === null) continue;
    const nombre = prefijo ? `${prefijo}[${clave}]` : clave;
    if (typeof valor === 'object') cuerpoFormulario(valor, nombre, destino);
    else destino.append(nombre, String(valor));
  }
  return destino;
}

async function llamarStripe(ruta, { metodo = 'GET', cuerpo, idempotencia } = {}) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), env.PAGOS_TIMEOUT_MS);
  try {
    const respuesta = await fetch(`${API}${ruta}`, {
      method: metodo,
      signal: controlador.signal,
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(idempotencia && { 'Idempotency-Key': idempotencia }),
      },
      body: cuerpo ? cuerpoFormulario(cuerpo).toString() : undefined,
    });
    const datos = await respuesta.json();
    // El mensaje del proveedor no se propaga al usuario: puede exponer detalles
    // de la cuenta. Se registra como detalle interno del error.
    if (!respuesta.ok) throw noDisponible({ estado: respuesta.status, tipo: datos?.error?.type });
    return datos;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw noDisponible({ causa: error.name });
  } finally {
    clearTimeout(temporizador);
  }
}

const traducirStripe = (sesion) => {
  if (sesion.payment_status === 'paid' || sesion.payment_status === 'no_payment_required')
    return RESULTADO.PAGADO;
  if (sesion.status === 'expired') return RESULTADO.EXPIRADO;
  if (sesion.status === 'complete') return RESULTADO.RECHAZADO;
  return RESULTADO.PENDIENTE;
};

const stripe = {
  nombre: 'stripe',
  async crearIntento({ referencia, montoSoles, concepto, urlExito, urlCancelacion }) {
    const sesion = await llamarStripe('/checkout/sessions', {
      metodo: 'POST',
      idempotencia: referencia,
      cuerpo: {
        mode: 'payment',
        success_url: urlExito,
        cancel_url: urlCancelacion,
        client_reference_id: referencia,
        metadata: { referencia },
        line_items: {
          0: {
            quantity: 1,
            price_data: {
              currency: env.PAGOS_MONEDA.toLowerCase(),
              unit_amount: aCentimos(montoSoles),
              product_data: { name: concepto },
            },
          },
        },
      },
    });
    return { idExterno: sesion.id, urlCheckout: sesion.url, resultado: traducirStripe(sesion) };
  },
  async consultarIntento(idExterno) {
    const sesion = await llamarStripe(`/checkout/sessions/${encodeURIComponent(idExterno)}`);
    return { idExterno: sesion.id, resultado: traducirStripe(sesion) };
  },
  /**
   * Verifica la firma del evento según el esquema de Stripe:
   * cabecera "t=<unix>,v1=<hmac>" y carga firmada "<t>.<cuerpo crudo>".
   * Devuelve la referencia de SAGE, nunca confía en el estado que trae el
   * mensaje: quien decide es consultarIntento (ADR-002).
   */
  verificarNotificacion(cuerpoCrudo, cabecera) {
    if (!cuerpoCrudo || !cabecera) throw firmaInvalida();
    const partes = Object.fromEntries(
      String(cabecera)
        .split(',')
        .map((p) => p.split('=').map((s) => s.trim()))
        .filter((p) => p.length === 2),
    );
    const marca = Number(partes.t);
    if (!Number.isFinite(marca)) throw firmaInvalida();
    if (Math.abs(Date.now() / 1000 - marca) > TOLERANCIA_FIRMA_SEGUNDOS) throw firmaInvalida();
    const esperada = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
      .update(`${marca}.${cuerpoCrudo.toString('utf8')}`)
      .digest('hex');
    if (!comparaSegura(esperada, partes.v1 ?? '')) throw firmaInvalida();
    const evento = JSON.parse(cuerpoCrudo.toString('utf8'));
    const sesion = evento?.data?.object ?? {};
    return {
      referencia: sesion.client_reference_id ?? sesion.metadata?.referencia ?? null,
      idExterno: sesion.id ?? null,
      tipoEvento: evento.type ?? 'desconocido',
    };
  },
};

const firmaInvalida = () =>
  new AppError(401, 'FIRMA_INVALIDA', 'La notificación no proviene de la pasarela de pagos.');

function comparaSegura(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// --------------------------------------------------------------- Simulada
// Reproduce el contrato de Stripe sin salir del proceso. El estado se controla
// desde las pruebas con simulada.marcar(idExterno, resultado).
const memoria = new Map();

const simulada = {
  nombre: 'simulada',
  async crearIntento({ referencia, montoSoles, concepto, urlExito }) {
    const idExterno = `sim_${randomUUID()}`;
    memoria.set(idExterno, { referencia, montoSoles, concepto, resultado: RESULTADO.PENDIENTE });
    return {
      idExterno,
      urlCheckout: `${urlExito}?simulado=${idExterno}`,
      resultado: RESULTADO.PENDIENTE,
    };
  },
  async consultarIntento(idExterno) {
    const intento = memoria.get(idExterno);
    if (!intento) throw noDisponible({ causa: 'INTENTO_INEXISTENTE' });
    return { idExterno, resultado: intento.resultado };
  },
  verificarNotificacion(cuerpoCrudo, cabecera) {
    if (!cuerpoCrudo || !cabecera) throw firmaInvalida();
    const esperada = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
      .update(cuerpoCrudo.toString('utf8'))
      .digest('hex');
    if (!comparaSegura(esperada, String(cabecera ?? ''))) throw firmaInvalida();
    const evento = JSON.parse(cuerpoCrudo.toString('utf8'));
    return {
      referencia: evento.referencia ?? null,
      idExterno: evento.idExterno ?? null,
      tipoEvento: evento.tipo ?? 'simulado',
    };
  },
  /** Solo para pruebas: fija el resultado que devolverá consultarIntento. */
  marcar(idExterno, resultado) {
    const intento = memoria.get(idExterno);
    if (intento) intento.resultado = resultado;
  },
  firmar(cuerpo) {
    return createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(cuerpo).digest('hex');
  },
  reiniciar() {
    memoria.clear();
  },
};

export const pasarela = env.PAGOS_PROVEEDOR === 'stripe' ? stripe : simulada;
export { simulada, stripe };
