FROM node:24.21.0-slim
WORKDIR /app

# Prisma necesita OpenSSL y la imagen slim no lo trae.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Incluye devDependencies: la CLI de Prisma hace falta para `migrate deploy`.
RUN npm ci

COPY . .
# prisma.config.js exige DATABASE_URL incluso para generar el cliente. La URL
# real llega en tiempo de ejecución; esta solo satisface la validación.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
    && chown -R node:node /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
EXPOSE 3000
USER node
# migrate deploy solo aplica las migraciones pendientes; repetirlo es seguro.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
