export const auditCreate = (userId) => ({ creadoPorId: userId, modificadoPorId: userId });
export const auditUpdate = (userId) => ({ modificadoPorId: userId });
