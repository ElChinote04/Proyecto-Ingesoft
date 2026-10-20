import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import * as schemas from '../validators/adminSchemas.js';
import * as controller from '../controllers/adminController.js';
import { vinculoSchema } from '../validators/portal.schemas.js';
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMINISTRADOR'));
adminRouter.get('/usuarios', controller.users);
adminRouter.post('/usuarios', validate(schemas.createUserSchema), controller.createUser);
adminRouter.put(
  '/usuarios/:id',
  validate(idSchema, 'params'),
  validate(schemas.editUserSchema),
  controller.updateUser,
);
adminRouter.get('/catalogos', controller.catalogs);
for (const [type, schema] of Object.entries(schemas.catalogSchemas))
  adminRouter.post('/catalogos/' + type, validate(schema), controller.createCatalog(type));
adminRouter.get('/estudiantes', controller.students);
adminRouter.post('/estudiantes', validate(schemas.studentSchema), controller.createStudent);
adminRouter.post('/matriculas', validate(schemas.enrollmentSchema), controller.enroll);
adminRouter.get('/horarios', controller.schedule);
adminRouter.post('/bloques', validate(schemas.blockSchema), controller.createBlock);
adminRouter.post('/sesiones', validate(schemas.classSchema), controller.createClass);
adminRouter.get('/auditoria', controller.audits);

adminRouter.put('/anios/:id/activacion', validate(idSchema, 'params'), controller.activarAnio);
adminRouter.put('/apoderados/estudiantes', validate(vinculoSchema), controller.vincularApoderado);
adminRouter.put(
  '/bloques/:id',
  validate(idSchema, 'params'),
  validate(schemas.blockSchema),
  controller.modificarBloque,
);
adminRouter.delete('/bloques/:id', validate(idSchema, 'params'), controller.eliminarBloque);
