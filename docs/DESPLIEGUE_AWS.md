# Despliegue de SAGE en AWS

Guía para publicar SAGE en AWS de la forma más simple posible: **un solo
servidor de Amazon Lightsail con Docker Compose**. Está pensada para un proyecto
de curso y para alguien que nunca ha desplegado en AWS.

Tiempo estimado la primera vez: 2 a 3 horas. Costo: 12 USD al mes, precio fijo.

## 1. Cómo queda

```
https://3-90-12-34.sslip.io
            │
   Servidor Lightsail (Ubuntu + Docker Compose)
   ┌────────────────────────────────────────────┐
   │ web (Caddy) :80/:443                       │
   │   ├── /*      → frontend compilado         │
   │   └── /api/*  → backend :3000              │
   │                    │                       │
   │                 db (PostgreSQL 18)         │
   └────────────────────────────────────────────┘
```

Todo vive en una máquina, definido en `docker-compose.prod.yml`:

| Contenedor | Qué hace                                                        |
| ---------- | --------------------------------------------------------------- |
| `web`      | Caddy: sirve el frontend, reenvía `/api` y gestiona HTTPS solo  |
| `backend`  | Express; aplica las migraciones pendientes al arrancar          |
| `db`       | PostgreSQL 18 con un volumen persistente; no se expone a la red |

Por qué así:

- **Un solo servidor** evita configurar RDS, balanceadores, redes y permisos.
  Lightsail tiene precio fijo e incluye IP pública.
- **Caddy obtiene el certificado HTTPS** de Let's Encrypt sin configurar nada.
  En producción SAGE exige HTTPS: la cookie de sesión es `Secure` y
  `config/env.js` rechaza un `FRONTEND_URL` con `http://`.
- **Frontend y API comparten dominio.** La cookie `sage_session` es
  `SameSite=Lax`; si estuvieran en dominios distintos, el navegador no la
  enviaría y la sesión no se mantendría.
- **No hace falta comprar un dominio.** [sslip.io](https://sslip.io) convierte
  la IP en un nombre: la IP `3.90.12.34` es `3-90-12-34.sslip.io`.

Lo que se sacrifica: no hay alta disponibilidad (si el servidor cae, cae
SAGE) y las copias de seguridad dependen de las instantáneas de Lightsail. Para
un curso es suficiente.

## 2. Requisitos

- Cuenta de AWS con un medio de pago. Las cuentas de AWS Academy / Learner Lab
  apagan los recursos al cerrar la sesión y no sirven para dejarlo publicado.
- Cuenta de Stripe en modo de prueba. **En producción SAGE no arranca con la
  pasarela simulada**, así que hacen falta las llaves de prueba (`sk_test_...`).
- Acceso al repositorio en GitHub. Si es privado, un _personal access token_
  con permiso de lectura.

Antes de crear nada, configura un presupuesto con alerta por correo en
_Billing → Budgets_ (por ejemplo, 15 USD al mes).

## 3. Crear el servidor

1. Entra en [Lightsail](https://lightsail.aws.amazon.com/) → _Create instance_.
2. Región: la más cercana a los usuarios con buen precio, por ejemplo
   `us-east-1`.
3. Plataforma _Linux/Unix_, plantilla _OS Only_ → **Ubuntu 24.04 LTS**.
4. Plan: **2 GB de RAM** (12 USD al mes). Con 1 GB la compilación de las
   imágenes puede quedarse sin memoria.
5. Nombre: `sage`. Crear.
6. **IP estática.** En _Networking → Create static IP_, asígnala a la
   instancia. Es gratuita mientras esté asignada. Sin ella, la IP cambia al
   reiniciar y el certificado deja de valer.
7. **Firewall.** En la pestaña _Networking_ de la instancia, en IPv4 firewall,
   deja SSH (22) y HTTP (80) y añade **HTTPS (443)**.

Tu dominio será la IP estática con guiones más `.sslip.io`. Ejemplo:
`3-90-12-34.sslip.io`.

## 4. Preparar el servidor

Conéctate con el botón _Connect using SSH_ de la consola de Lightsail y
ejecuta:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker ubuntu
```

Cierra la ventana SSH y vuelve a abrirla para que el cambio de grupo surta
efecto. Comprueba con:

```bash
docker compose version
```

Clona el repositorio:

```bash
git clone https://github.com/<organizacion>/<repositorio>.git sage
```

```bash
cd sage
```

## 5. Configurar las variables

```bash
cp deploy/.env.example deploy/.env
```

Genera un secreto por cada variable que lo necesita. Ejecuta este comando tres
veces y copia cada resultado en `POSTGRES_PASSWORD`, `JWT_SECRET` e
`INITIAL_SETUP_KEY`:

```bash
openssl rand -hex 32
```

Edita el archivo con `nano deploy/.env`:

| Variable                | Valor                                                     |
| ----------------------- | --------------------------------------------------------- |
| `SAGE_DOMINIO`          | `3-90-12-34.sslip.io` (tu IP con guiones), sin `https://` |
| `POSTGRES_PASSWORD`     | Secreto generado                                          |
| `JWT_SECRET`            | Secreto generado                                          |
| `INITIAL_SETUP_KEY`     | Secreto generado; guárdalo, se usa en el paso 7           |
| `STRIPE_SECRET_KEY`     | `sk_test_...` del dashboard de Stripe                     |
| `STRIPE_WEBHOOK_SECRET` | Provisional: otro secreto generado. El real, en el paso 8 |

`deploy/.env` no se versiona. No lo subas al repositorio.

## 6. Levantar SAGE

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build
```

La primera vez tarda entre 5 y 10 minutos: descarga imágenes, instala
dependencias y compila el frontend. Después:

```bash
docker compose -f docker-compose.prod.yml ps
```

Los tres servicios deben aparecer como `running`. Abre
`https://3-90-12-34.sslip.io/api/v1/health` en el navegador. Si responde, SAGE
está publicado.

Para ver los registros:

```bash
docker compose -f docker-compose.prod.yml logs -f backend
```

## 7. Primer administrador

1. Abre `https://3-90-12-34.sslip.io`.
2. La aplicación pide crear el primer administrador y la clave de instalación:
   el valor de `INITIAL_SETUP_KEY`.
3. **No ejecutes `db:seed`** en este servidor. Carga datos de demostración con
   contraseñas conocidas.

## 8. Conectar Stripe

1. En el dashboard de Stripe (modo de prueba): _Developers → Webhooks → Add
   endpoint_.
   - URL: `https://3-90-12-34.sslip.io/api/v1/pagos/notificaciones`.
   - Eventos: `checkout.session.completed`, `checkout.session.expired`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`.
2. Copia el _Signing secret_ (`whsec_...`) en `STRIPE_WEBHOOK_SECRET` de
   `deploy/.env`.
3. Reinicia el backend con la nueva variable:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d backend
   ```

## 9. Verificación

- [ ] La sesión se mantiene al recargar la página.
- [ ] Cinco contraseñas erróneas bloquean solo esa cuenta.
- [ ] La auditoría registra la IP real del cliente, no una IP interna de Docker.
- [ ] Un pago con la tarjeta de prueba `4242 4242 4242 4242` vuelve a
      `/#/pagos/<id>/resultado` y la boleta pasa a pagada.

## 10. Actualizar a una versión nueva

```bash
cd ~/sage && git pull
```

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Las migraciones nuevas se aplican solas al arrancar el backend. Antes de una
migración que cambie datos, haz una copia de seguridad (sección 11).

## 11. Copias de seguridad

- **Instantánea del servidor.** En Lightsail, pestaña _Snapshots_: crea una
  manual antes de cada presentación o activa las automáticas diarias. Guarda el
  disco completo, base de datos incluida.
- **Volcado de la base**, para conservarla fuera del servidor:

  ```bash
  docker compose -f docker-compose.prod.yml exec -T db pg_dump -U sage sage > sage-$(date +%F).sql
  ```

## 12. Problemas habituales

| Síntoma                                                 | Causa probable                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| La página no carga o el navegador avisa del certificado | Falta abrir el puerto 443, o `SAGE_DOMINIO` no coincide con la IP estática    |
| La compilación se corta con `Killed`                    | Falta memoria: usa el plan de 2 GB                                            |
| `Falta ... en deploy/.env`                              | Variable vacía en `deploy/.env`, o falta `--env-file deploy/.env`             |
| El backend se reinicia en bucle                         | Mira `logs backend`: casi siempre es una variable inválida de `config/env.js` |
| `Configuración inválida: ...`                           | Una variable no cumple el esquema (por ejemplo, un secreto de menos de 32)    |
| `ORIGIN_FORBIDDEN` (403)                                | El dominio con el que entras no es exactamente `SAGE_DOMINIO`                 |
| El pago se cobra pero la boleta no cambia               | URL del webhook o `STRIPE_WEBHOOK_SECRET` incorrectos                         |

## 13. Apagar o eliminar

- **Detener** la instancia conserva los datos, pero Lightsail sigue cobrando el
  plan mientras exista. No sirve para ahorrar.
- **Eliminar** es lo único que deja de cobrar: crea antes una instantánea si
  quieres conservar los datos, borra la instancia y libera la IP estática. Una
  IP estática sin asignar tiene costo.

## 14. Detalles técnicos

Ajustes que el código ya incluye para este despliegue, cubiertos por
`backend/tests/despliegue.test.js`:

- **`TRUST_PROXY`.** Detrás de un proxy, `req.ip` sería la del proxy para todos
  los usuarios: el límite de 30 intentos de acceso cada 15 minutos se
  compartiría entre todos y la auditoría perdería la IP real. Caddy descarta el
  `X-Forwarded-For` que mande el cliente y escribe la IP real, así que hay un
  solo salto de confianza: `docker-compose.prod.yml` fija `TRUST_PROXY=1`. Por
  defecto vale `0`, que ignora la cabecera. Un valor mayor que el real
  permitiría falsificar la IP.
- **Registros por consola.** Con `NODE_ENV=production` el logger escribe
  también por la salida estándar, que es lo que muestra
  `docker compose logs`.
- **Imagen del backend.** `prisma.config.js` exige `DATABASE_URL` incluso para
  generar el cliente, así que `backend/Dockerfile` usa una URL ficticia al
  compilar; la real llega al arrancar. La imagen es Debian `slim` y no Alpine
  porque `bcrypt` usa un módulo nativo.

**Si más adelante hace falta algo más robusto** (alta disponibilidad, base de
datos administrada, escalado), el siguiente paso en AWS es ECS Express Mode con
RDS. App Runner no es opción: AWS lo cerró a clientes nuevos el 30 de abril de 2026.
