import { readFileSync } from 'node:fs';
const content = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
const key = content.match(/^INITIAL_SETUP_KEY=(.+)$/m)?.[1].trim();
if (!key || key === 'generate_on_setup') throw new Error('Ejecuta npm run setup primero.');
// Salida solicitada por el operador local; nunca se registra en los logs HTTP.
console.log('Clave local para crear el primer administrador (no compartir):');
console.log(key);
