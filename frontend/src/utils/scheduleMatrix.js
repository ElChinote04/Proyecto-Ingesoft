const minutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
const hora = (valor) =>
  `${String(Math.floor(valor / 60)).padStart(2, '0')}:${String(valor % 60).padStart(2, '0')}`;

export function buildScheduleMatrix(bloques) {
  if (!bloques.length)
    return { horas: [], alturas: [], dias: Array.from({ length: 7 }, () => [[]]) };
  const limites = new Set(bloques.flatMap((b) => [minutos(b.horaInicio), minutos(b.horaFin)]));
  const primero = Math.min(...limites),
    ultimo = Math.max(...limites);
  for (let minuto = Math.ceil(primero / 60) * 60; minuto < ultimo; minuto += 60)
    limites.add(minuto);
  const tiempos = [...limites].sort((a, b) => a - b);
  const horas = tiempos.map(hora);
  const alturas = tiempos.slice(1).map((fin, i) => Math.max(40, (fin - tiempos[i]) * 1.5));
  // Asegura espacio legible para los datos incluso en clases de pocos minutos.
  for (const bloque of bloques) {
    const inicio = horas.indexOf(bloque.horaInicio),
      fin = horas.indexOf(bloque.horaFin);
    const alto = alturas.slice(inicio, fin).reduce((total, valor) => total + valor, 0);
    if (alto < 148) {
      const extra = (148 - alto) / (fin - inicio);
      for (let i = inicio; i < fin; i += 1) alturas[i] += extra;
    }
  }
  // Al mostrar varios recursos, sus clases simultáneas ocupan columnas separadas.
  const dias = Array.from({ length: 7 }, (_, dia) => {
    const columnas = [[]];
    for (const bloque of bloques
      .filter((b) => b.diaSemana === dia + 1)
      .sort(
        (a, b) =>
          a.horaInicio.localeCompare(b.horaInicio) ||
          a.horaFin.localeCompare(b.horaFin) ||
          a.id - b.id,
      )) {
      let columna = columnas.find(
        (items) => !items.length || items.at(-1).horaFin <= bloque.horaInicio,
      );
      if (!columna) {
        columna = [];
        columnas.push(columna);
      }
      columna.push(bloque);
    }
    return columnas;
  });
  return { horas, alturas, dias };
}
