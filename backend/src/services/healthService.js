import { pingDatabase } from '../repositories/healthRepository.js';
export async function health() {
  await pingDatabase();
  return { status: 'ok', database: 'connected' };
}
