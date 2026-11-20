import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import * as controller from '../controllers/libretas.controller.js';

// Sin requireRole: quien entra lo decide su vínculo con el estudiante, no un rol. El service rechaza
// al resto, incluso al administrador.
export const libretasRouter = Router();
libretasRouter.use(requireAuth);
libretasRouter.get('/', controller.listar);
libretasRouter.get('/:id', validate(idSchema, 'params'), controller.consultar);
