# Verificación de entrega

Fecha: 1 de octubre de 2026. Entorno: Windows x64, Node 24.21.0 local al proyecto, Docker Desktop, PostgreSQL 18.6. Repositorio: Proyecto-Ingesoft, rama de trabajo `feat/prototipo-arquitectura-sage`.

## Resultados ejecutados

| Comprobación                                                        | Resultado observado                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Sage.ps1` | Exit 0; npm ci en raíz/backend/frontend, Docker sano, Prisma generado, migrate deploy y seed correctos |
| Generación Prisma                                                   | Client 7.10.0 generado                                                                                 |
| Migración de demo                                                   | `20261001022912_initial_sage` aplicada; sin migraciones pendientes al repetir                          |
| Creación desde cero                                                 | La misma migración aplicada en una nueva BD PostgreSQL de pruebas                                      |
| Seed repetido                                                       | 4 roles, 2 cuentas, 5 alumnos/matrículas, 1 sesión; las 5 asistencias previas se conservan             |
| `npm test`                                                          | 20 pruebas, 20 aprobadas, 0 fallos, 0 omitidas; última ejecución 12.86 s                               |
| `npm run lint`                                                      | Exit 0, sin errores                                                                                    |
| `npm run build`                                                     | Exit 0, Vite 8.3.1, 32 módulos, 1.09 s; dist generado                                                  |
| `node --check`                                                      | Correcto para archivos JS de backend y scripts                                                         |
| Auditorías npm de raíz/backend/frontend                             | 0 vulnerabilidades reportadas en las tres                                                              |
| `Start-Sage.ps1`                                                    | Levanta Docker, backend y frontend con el runtime local                                                |
| Health del servidor iniciado                                        | HTTP 200, status ok, database connected                                                                |
| Git                                                                 | .env, logs, .tools, node_modules y dist ignorados; diff sin errores de whitespace                      |

El frontend produjo un bundle JS de aproximadamente 235.90 kB (73.43 kB gzip), CSS de 8.90 kB (2.55 kB gzip) y fuentes locales. El backend es JavaScript ESM y no necesita build.

## Cobertura de pruebas de integración

1. Health con consulta real a PostgreSQL.
2. Login correcto, bcrypt, DTO seguro y cookie HttpOnly/SameSite.
3. Contraseña incorrecta e identificador inexistente.
4. Lectura y escritura sin autenticación: 401.
5. APODERADO autenticado: 403.
6. Consulta de sesión y rechazo de lectura/escritura de sesiones ajenas.
7. Padrón de cinco alumnos obtenido de la BD.
8. Guardado transaccional y evento de auditoría.
9. Estado no permitido: 400.
10. Alumno sin matrícula en sección: 400, sin escritura parcial.
11. Recuperación de estados y observación persistidos.
12. Duplicados y versión antigua: 409; actualización sin duplicar filas.
13. Arreglo vacío/incompleto, IDs inválidos, sesión inexistente y propiedades extra.
14. Dos guardados simultáneos: exactamente uno 200 y otro 409.
15. Una persona con DOCENTE y APODERADO al mismo tiempo.
16. Cuenta inactiva y JWT vencido/manipulado.
17. CORS, JSON inválido y ruta inexistente.
18. Seed idempotente conserva datos.
19. Logout revoca cookie y JWT en BD, incluyendo reenvío del token anterior.
20. Error 500 centralizado, logs físicos y ausencia de secretos en logs.

Las pruebas crean y eliminan exclusivamente su propia BD aleatoria; la base demo no se reinicia.

## Comprobación manual en navegador

Se ejecutaron realmente login fallido y correcto, selección de Matemática 3.° B, lectura de los cinco alumnos, selección de los tres estados, guardado y confirmación. Después se abrió **Revisar asistencia** y se recargó: las marcas y la observación permanecieron. También se verificaron el aviso de sesión vencida, logout, login requerido para ruta protegida y pantalla de acceso restringido del apoderado.

Se inspeccionó el mensaje largo de credenciales incorrectas en un viewport de 319 px: texto completo, sin tooltip, sin truncado y sin desbordamiento horizontal de la página. La tabla de asistencia permite desplazamiento horizontal cuando el espacio es reducido.

La consulta SQL directa sobre la base demo confirmó:

| Alumno          | Estado persistido | Observación       |
| --------------- | ----------------- | ----------------- |
| Carlos Mendoza  | PRESENTE          |                   |
| Lucía Ramos     | TARDANZA          | Llegó a las 08:12 |
| Diego Torres    | AUSENTE           |                   |
| Valeria Sánchez | PRESENTE          |                   |
| Mateo Ruiz      | PRESENTE          |                   |

Se confirmó un evento `ASISTENCIA_GUARDADA` asociado al usuario Ana Torres y la sesión. Ambos archivos físicos `backend/logs/app.log` y `backend/logs/error.log` tienen contenido. El segundo incluye un error controlado de las pruebas; no representa un fallo pendiente del flujo real.

## Alcance y limitaciones reales

Capturas de la comprobación: [asistencia recargada](evidencias/SAGE_asistencia.png), [confirmación](evidencias/SAGE_confirmacion.png), [selección](evidencias/SAGE_sesiones.png) y [error de login completo](evidencias/SAGE_login_error.png).

No hay bloqueos técnicos conocidos del flujo solicitado. Las verificaciones descritas se ejecutaron localmente, antes de publicar la rama para revisión en GitHub; no constituyen una ejecución de CI remoto. No se ejecutó despliegue AWS/HTTPS. El script de descarga automática de Node está preparado para Windows x64; en otros sistemas se usa Node 24.21.0 ya instalado y `npm run setup`.

La reproducción de Figma está adaptada al alcance Login + Asistencia y a los datos reales; no incluye módulos ajenos, enlaces de simulación ni cifras estáticas de los mockups. No se recibió un estándar de programación separado; se siguieron las decisiones explícitas del usuario, ESLint y Prettier.
