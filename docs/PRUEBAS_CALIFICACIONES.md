# Pruebas de evaluaciones y letra calculada

Recorrido en el navegador del flujo de calificación: evaluaciones del salón, nota 0–20 con el
examen corregido, letra calculada con la escala y publicación de la libreta. Las reglas están en
`docs/API.md` («Evaluaciones y escala de calificación»).

## Preparación

```bash
npm run setup
npm --prefix backend run db:seed
npm run dev
```

El seed deja en 3.° B, IV bimestre de Matemática (`MAT-03`), dos competencias con dos
evaluaciones cada una, la regla de consolidación con `minimoNotas: 2` y resultados de los cinco
alumnos: notas con su examen, un «No rindió», una justificada y dos pendientes en el examen
parcial, para que la sección aparezca con pendientes al publicar.

Cuentas: `docente@sage.local` y `apoderado@sage.local`, con la contraseña `DEMO_PASSWORD` de
`backend/.env`. El administrador es el que se creó en la instalación inicial.

## Docente

1. **Calificaciones**: elegir 3.° B y el IV bimestre.
2. **Evaluaciones del bimestre**: la lista muestra «3 de 5 registrados» en el examen parcial.
   **Ver faltan** nombra a quién le falta.
3. **+ Nueva evaluación**: probar una fecha fuera del bimestre (el formulario la rechaza) y luego
   crear «Práctica 2» con peso 1.
4. Editar el examen parcial y cambiar su peso a 3: al cerrar, el promedio de los alumnos cambia.
   La competencia de una evaluación con notas no se puede cambiar.
5. **Calificar** a un alumno: cada competencia lista sus evaluaciones y termina con «Promedio
   16,33 → A · falta 1».
6. **Registrar** una evaluación pendiente:
   - Con nota y sin archivo, el formulario pide el examen. Con nota `20,5` avisa del rango.
   - Con nota y un PDF, guarda y la letra se actualiza.
   - **No rindió** cuenta 0; **Justificada** pide el motivo y no cuenta.
7. **Editar** una nota y **Quitar** su archivo sin subir otro: pide el examen. **Dejar pendiente**
   quita el resultado.
8. Eliminar «Práctica 2» desde la lista: avisa cuántos resultados dejarán de contar.

## Administrador

1. **Gestión académica → Competencias y reglas**: la tarjeta **Escala de calificación** muestra
   los rangos y una vista previa. Probar A ≥ AD (lo rechaza) y luego AD 17 · A 13 · B 10: avisa
   que recalcula lo no publicado.
2. En el formulario de una regla, **Mínimo de notas por competencia** es lo que pide cada alumno
   para publicar.
3. **Publicación de libretas** del IV bimestre: 3.° B aparece con pendientes. **Ver pendientes**
   detalla notas por registrar, sin letra, bajo el mínimo y si falta la regla.
4. Completar las notas como docente y publicar: la sección pasa a «Publicada» y en el modal del
   docente todo queda en solo lectura.

## Familia

En la libreta, el alumno y el apoderado ven solo las letras de lo publicado. Ni las notas 0–20 ni
los exámenes llegan al navegador de la familia.
