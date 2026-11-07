const NIVELES = ['C', 'B', 'A', 'AD'];

export function metodoRegla(metodo) {
  try {
    return JSON.parse(metodo);
  } catch {
    return { estrategia: metodo, desempate: 'reciente', minimoEvidencias: 1 };
  }
}

/** Aplica la estrategia de una regla ya interpretada, sin exigir un mínimo de notas. */
export function aplicarRegla(items, regla) {
  if (regla.estrategia === 'reciente') return items.at(-1).nivelLogro;
  if (regla.estrategia === 'prioridad') {
    return items.reduce(
      (mejor, item) =>
        NIVELES.indexOf(item.nivelLogro) > NIVELES.indexOf(mejor) ? item.nivelLogro : mejor,
      items[0].nivelLogro,
    );
  }

  const conteos = new Map();
  for (const item of items) conteos.set(item.nivelLogro, (conteos.get(item.nivelLogro) || 0) + 1);
  const maximo = Math.max(...conteos.values());
  const candidatas = NIVELES.filter((nivel) => conteos.get(nivel) === maximo);
  if (candidatas.length === 1 || regla.desempate === 'alto')
    return candidatas[candidatas.length - 1];
  if (regla.desempate === 'bajo') return candidatas[0];
  return [...items].reverse().find((item) => candidatas.includes(item.nivelLogro)).nivelLogro;
}

export function consolidar(items, metodo) {
  if (!items.length) return null;
  const regla = metodoRegla(metodo);
  if (items.length < (regla.minimoEvidencias || 1)) return null;
  return aplicarRegla(items, regla);
}
