const VISTAS = [
  ['#/gestion', 'Reglas y publicación'],
  ['#/gestion/planes', 'Planes de trabajo'],
];

export default function PestanasGestion({ actual }) {
  return (
    <nav className="pagos-pestanas" aria-label="Vistas de gestión académica">
      {VISTAS.map(([ruta, etiqueta]) => (
        <a
          key={ruta}
          href={ruta}
          className={ruta === actual ? 'pestana activa' : 'pestana'}
          aria-current={ruta === actual ? 'page' : undefined}
        >
          {etiqueta}
        </a>
      ))}
    </nav>
  );
}
