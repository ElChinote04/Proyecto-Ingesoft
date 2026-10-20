import { app } from './app.js';
import { env } from './config/env.js';
import { health } from './services/healthService.js';
import { prisma } from './config/database.js';
import { logger } from './logging/logger.js';
try {
  await health();
  logger.info('PostgreSQL disponible', { module: 'database' });
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info('Aplicación iniciada', { module: 'server', port: env.PORT });
    console.log(`SAGE API: http://${env.HOST}:${env.PORT}/api/v1/health`);
  });
  server.on('error', () => {
    logger.error('No se pudo abrir el puerto HTTP', { module: 'server' });
    process.exitCode = 1;
    prisma.$disconnect();
  });
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      server.close(async () => {
        await prisma.$disconnect();
        logger.end();
      });
    });
} catch {
  logger.error('No se pudo iniciar la aplicación: comprueba la conexión a PostgreSQL', {
    module: 'database',
  });
  console.error('No se pudo iniciar SAGE. Revisa PostgreSQL y backend/logs/error.log.');
  await prisma.$disconnect();
  process.exitCode = 1;
}
