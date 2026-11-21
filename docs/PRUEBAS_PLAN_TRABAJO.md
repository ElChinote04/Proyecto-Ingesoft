# Probar el plan de trabajo semanal en pantalla

El plan de trabajo es del docente y está separado de las calificaciones: nada de este
recorrido cambia notas, evidencias de calificación ni libretas.

## Preparación

```bash
cd backend
npx prisma migrate deploy
npm run db:seed
cd ..
npm run dev
```

El seed es idempotente. Deja:

- Fechas para los cuatro bimestres de 2026; solo las pone si el bimestre no tenía fechas.
- Un plan «Plan de Matemática – IV Bimestre» de `MAT-03` 3.° B para `docente@sage.local`, con
  actividades publicadas en las semanas 1, 2, 3 y 6, una subida (oculta) en la 7 y una programada
  para el inicio de la semana 9.
- `apoderado@sage.local` vinculada como madre de Carlos Mendoza.

Las cuentas de demo usan la contraseña de `DEMO_PASSWORD` de `backend/.env`.

## Docente

1. Entrar como `docente@sage.local` y abrir **Plan de trabajo** en el menú.
2. Curso, sección y bimestre se eligen solos si hay una sola opción. El bimestre en curso viene
   preseleccionado.
3. Se ve una fila por semana, también las vacías («Sin actividades»), con sus fechas.
4. **+ Actividad** en una semana: elegir tipo, escribir el título y adjuntar un PDF. Probar
   primero un enlace `http://…`: el modal muestra el error y conserva lo escrito. Corregirlo a
   `https://…` y registrar. Sin tocar «Visibilidad para los alumnos», la tarjeta queda «Oculta».
5. Subir otra con **Programar la publicación**: propone el inicio de su semana y la tarjeta dice
   «Programada · fecha». Ese día aparece sola para los alumnos.
6. Abrir la actividad oculta de la semana 7, elegir **Publicar ahora** y guardar: pasa a
   «Publicada». Con **Oculta** vuelve a desaparecer para los alumnos.
7. En una actividad con archivos, **Quitar** pide confirmación. **Dar de baja** saca la
   actividad del plan.
8. Con un bimestre pasado, la vista queda en solo lectura y sin botones de alta.

## Administrador

1. **Catálogos académicos → Fechas de los bimestres**. Si se acorta un bimestre que tiene
   actividades en semanas posteriores, se rechaza y la tabla dice qué clase y qué semana lo
   impiden.
2. **Gestión académica → Planes de trabajo**: filtrar por bimestre, curso o sección y pulsar
   **Revisar** en un plan.
3. En una actividad publicada: **Validar**, u **Observar** con observaciones, que son
   obligatorias. El docente ve la observación al abrir la actividad. Una validada ya no la edita.

## Apoderado

1. Entrar como `apoderado@sage.local` y abrir **Actividades de clase**.
2. Elegir el curso: si dos cursos se llaman igual, se distinguen por su código, por ejemplo
   «Matemática (MAT-03)».
3. Solo aparecen las actividades publicadas hasta hoy que la coordinación no observó, sin datos del
   docente ni de la revisión. No hay botones de edición.

## Pruebas automáticas

```bash
cd backend
npm test
```

La suite `evidencias-pedagogicas` (EVP-01 a EVP-19) cubre las reglas: semanas del bimestre,
fechas, alcance por rol, atomicidad con archivos, concurrencia, revisión, bloqueo tras el
cierre, reasignación del docente y las restricciones de la base de datos.
