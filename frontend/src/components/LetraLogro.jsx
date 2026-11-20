// La letra calculada (AD, A, B o C) con el color de la libreta.
export default function LetraLogro({ nivel }) {
  return <span className={`achievement achievement-${nivel.toLowerCase()}`}>{nivel}</span>;
}
