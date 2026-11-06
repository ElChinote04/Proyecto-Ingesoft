# Etapa 1: compila el frontend. La API se llama en el mismo dominio, a través
# de Caddy, para que la cookie de sesión (SameSite=Lax) viaje en cada petición.
FROM node:24.21.0-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_API_URL=/api/v1
RUN npm run build

# Etapa 2: Caddy sirve los estáticos, reenvía /api al backend y obtiene el
# certificado HTTPS automáticamente. La configuración está en deploy/Caddyfile.
FROM caddy:2.10.2
COPY --from=build /app/dist /srv
