import { health } from '../services/healthService.js';
export const check = async (_req, res) => res.json(await health());
