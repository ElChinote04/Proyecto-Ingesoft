import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pathToFileURL } from 'node:url';
import { guardarArchivos } from '../src/integrations/almacenEvidencias.js';
import { recalcularLogro } from '../src/services/logros.service.js';

const EXAMEN_DEMO = Buffer.from('%PDF-1.4\n%Examen corregido de demostración\n');

// Evaluaciones de demo del IV bimestre de Matemática en 3.° B. Cada fila es un alumno, en el
// orden de la lista de alumnos: una nota, NO_RINDIO, JUSTIFICADA o null (pendiente).
const EVALUACIONES_DEMO = [
  ['MAT-03-C1', 'Práctica calificada 1', '2026-10-16', 1, [15, 18, 'NO_RINDIO', 'JUSTIFICADA', 12]],
  ['MAT-03-C1', 'Examen parcial', '2026-11-06', 2, [16.5, 19, 11, null, null]],
  ['MAT-03-C2', 'Práctica calificada 1', '2026-10-23', 1, [13, 17, 9, 14, 10.5]],
  ['MAT-03-C2', 'Trabajo en equipo', '2026-11-13', 1, [14, 18, 12, 15, 11]],
];

/**
 * Registra los resultados de demo y calcula sus letras con el mismo servicio que la API. Los
 * exámenes se escriben en disco antes; si el seed falla después, quedan archivos sin fila,
 * aceptable en datos de demostración.
 */
async function sembrarEvaluaciones(tx, { clase, asignacion, competencias, estudiantes, usuario }) {
  const escala = await tx.escalaCalificacion.findFirst({ where: { vigenteHasta: null } });
  const notas = EVALUACIONES_DEMO.flatMap(([, , , , resultados]) =>
    resultados.filter((valor) => typeof valor === 'number'),
  );
  const archivos = await guardarArchivos(notas.map(() => EXAMEN_DEMO));
  for (const [codigo, titulo, fecha, peso, resultados] of EVALUACIONES_DEMO) {
    const evaluacion = await tx.evaluacion.create({
      data: {
        ...clase,
        asignacionId: asignacion.id,
        competenciaId: competencias[codigo].id,
        titulo,
        fecha: new Date(`${fecha}T00:00:00Z`),
        peso,
        creadoPorId: usuario.id,
        modificadoPorId: usuario.id,
      },
    });
    for (const [indice, valor] of resultados.entries()) {
      if (valor === null) continue;
      const calificada = typeof valor === 'number';
      const matricula = await tx.matricula.findFirst({
        where: { estudianteId: estudiantes[indice].id, seccionId: clase.seccionId },
      });
      await tx.resultadoEvaluacion.create({
        data: {
          evaluacionId: evaluacion.id,
          matriculaId: matricula.id,
          condicion: calificada ? 'CALIFICADA' : valor,
          nota: calificada ? valor.toFixed(2) : null,
          motivo: valor === 'JUSTIFICADA' ? 'Certificado médico presentado por la familia.' : null,
          creadoPorId: usuario.id,
          modificadoPorId: usuario.id,
          ...(calificada && {
            archivos: {
              create: {
                nombreOriginal: `${titulo} - ${estudiantes[indice].codigoEstudiante}.pdf`,
                nombreAlmacenado: archivos.shift(),
                tipoMime: 'application/pdf',
                tamanoBytes: EXAMEN_DEMO.length,
                creadoPorId: usuario.id,
              },
            },
          }),
        },
      });
      await recalcularLogro(
        {
          matriculaId: matricula.id,
          bimestreId: clase.bimestreId,
          cursoId: clase.cursoId,
          seccionId: clase.seccionId,
          competenciaId: competencias[codigo].id,
          asignacionId: asignacion.id,
        },
        escala,
        usuario,
        tx,
      );
    }
  }
}

export async function seed(db) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('El seed demo no se ejecuta en producción.');
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10)
    throw new Error('Configura DEMO_PASSWORD en backend/.env (mínimo 10 caracteres).');
  const hashContrasena = await bcrypt.hash(password, 12);
  return db.$transaction(
    async (tx) => {
      const roles = {};
      const tieneAnioActivo = Boolean(
        await tx.anioAcademico.findFirst({ where: { activo: true } }),
      );
      for (const nombre of ['ADMINISTRADOR', 'DOCENTE', 'ALUMNO', 'APODERADO']) {
        roles[nombre] = await tx.rol.upsert({ where: { nombre }, update: {}, create: { nombre } });
      }
      const persona = await tx.persona.upsert({
        where: { numeroDocumento: 'DEMO-DOC-001' },
        update: {},
        create: { numeroDocumento: 'DEMO-DOC-001', nombres: 'Ana', apellidos: 'Torres' },
      });
      const user = await tx.usuario.upsert({
        where: { identificador: 'docente@sage.local' },
        update: {},
        create: { identificador: 'docente@sage.local', hashContrasena, personaId: persona.id },
      });
      await tx.usuarioRol.upsert({
        where: { usuarioId_rolId: { usuarioId: user.id, rolId: roles.DOCENTE.id } },
        update: {},
        create: { usuarioId: user.id, rolId: roles.DOCENTE.id },
      });
      const docente = await tx.docente.upsert({
        where: { personaId: persona.id },
        update: {},
        create: { personaId: persona.id, codigoDocente: 'DOC-001' },
      });
      const guardian = await tx.persona.upsert({
        where: { numeroDocumento: 'DEMO-APO-001' },
        update: {},
        create: { numeroDocumento: 'DEMO-APO-001', nombres: 'Elena', apellidos: 'Mendoza' },
      });
      const guardianUser = await tx.usuario.upsert({
        where: { identificador: 'apoderado@sage.local' },
        update: {},
        create: { identificador: 'apoderado@sage.local', hashContrasena, personaId: guardian.id },
      });
      await tx.usuarioRol.upsert({
        where: { usuarioId_rolId: { usuarioId: guardianUser.id, rolId: roles.APODERADO.id } },
        update: {},
        create: { usuarioId: guardianUser.id, rolId: roles.APODERADO.id },
      });
      const anio = await tx.anioAcademico.upsert({
        where: { codigo: '2026' },
        update: {},
        create: { codigo: '2026', activo: !tieneAnioActivo },
      });
      const grado = await tx.grado.upsert({
        where: { nombre: '3.°' },
        update: {},
        create: { nombre: '3.°' },
      });
      const seccion = await tx.seccion.upsert({
        where: {
          gradoId_anioAcademicoId_nombre: {
            gradoId: grado.id,
            anioAcademicoId: anio.id,
            nombre: 'B',
          },
        },
        update: {},
        create: { gradoId: grado.id, anioAcademicoId: anio.id, nombre: 'B' },
      });
      const curso = await tx.curso.upsert({
        where: { codigo: 'MAT-03' },
        update: {},
        create: { codigo: 'MAT-03', nombre: 'Matemática' },
      });
      const asignacion = await tx.cursoSeccionDocente.upsert({
        where: {
          cursoId_seccionId_docenteId: {
            cursoId: curso.id,
            seccionId: seccion.id,
            docenteId: docente.id,
          },
        },
        update: {},
        create: { cursoId: curso.id, seccionId: seccion.id, docenteId: docente.id },
      });
      const aula = await tx.aula.upsert({
        where: { codigo: 'A-203' },
        update: {},
        create: { codigo: 'A-203' },
      });
      const bloqueData = {
        asignacionId: asignacion.id,
        aulaId: aula.id,
        diaSemana: 5,
        horaInicio: '08:00',
      };
      const bloque =
        (await tx.cursoSeccionDocenteAula.findFirst({
          where: bloqueData,
          orderBy: [{ activo: 'desc' }, { id: 'asc' }],
        })) ??
        (await tx.cursoSeccionDocenteAula.create({
          data: { ...bloqueData, horaFin: '08:45' },
        }));
      const fecha = new Date('2026-10-02T00:00:00Z');
      const sesion = await tx.sesionClase.upsert({
        where: { bloqueId_fecha: { bloqueId: bloque.id, fecha } },
        update: {},
        create: { bloqueId: bloque.id, fecha, horaInicio: '08:00', horaFin: '08:45' },
      });
      const alumnos = [
        ['Carlos', 'Mendoza'],
        ['Lucía', 'Ramos'],
        ['Diego', 'Torres'],
        ['Valeria', 'Sánchez'],
        ['Mateo', 'Ruiz'],
      ];
      const estudiantes = [];
      for (const [index, [nombres, apellidos]] of alumnos.entries()) {
        const code = `DEMO-EST-${index + 1}`;
        const person = await tx.persona.upsert({
          where: { numeroDocumento: code },
          update: {},
          create: { numeroDocumento: code, nombres, apellidos },
        });
        const student = await tx.estudiante.upsert({
          where: { personaId: person.id },
          update: {},
          create: { personaId: person.id, codigoEstudiante: `EST-00${index + 1}` },
        });
        estudiantes.push(student);
        await tx.matricula.upsert({
          where: {
            estudianteId_anioAcademicoId: { estudianteId: student.id, anioAcademicoId: anio.id },
          },
          update: {},
          create: { estudianteId: student.id, anioAcademicoId: anio.id, seccionId: seccion.id },
        });
      }
      // La apoderada de demo es la madre de Carlos Mendoza, para probar la vista familiar.
      const apoderado = await tx.apoderado.upsert({
        where: { personaId: guardian.id },
        update: {},
        create: { personaId: guardian.id },
      });
      await tx.apoderadoEstudiante.upsert({
        where: {
          apoderadoId_estudianteId: { apoderadoId: apoderado.id, estudianteId: estudiantes[0].id },
        },
        update: {},
        create: { apoderadoId: apoderado.id, estudianteId: estudiantes[0].id, parentesco: 'Madre' },
      });

      // Fechas de los bimestres de 2026. Si alguien ya las fijó desde la pantalla, se respetan.
      const fechasBimestres = [
        ['I Bimestre', '2026-03-09', '2026-05-08'],
        ['II Bimestre', '2026-05-18', '2026-07-17'],
        ['III Bimestre', '2026-08-03', '2026-10-02'],
        ['IV Bimestre', '2026-10-12', '2026-12-18'],
      ];
      const bimestres = [];
      for (const [indice, [nombre, inicio, fin]] of fechasBimestres.entries()) {
        const clave = { anioAcademicoId: anio.id, numero: indice + 1 };
        const fechas = {
          fechaInicio: new Date(`${inicio}T00:00:00Z`),
          fechaFin: new Date(`${fin}T00:00:00Z`),
        };
        const existente = await tx.bimestreAcademico.findUnique({
          where: { anioAcademicoId_numero: clave },
        });
        bimestres.push(
          !existente
            ? await tx.bimestreAcademico.create({ data: { ...clave, nombre, ...fechas } })
            : existente.fechaInicio
              ? existente
              : await tx.bimestreAcademico.update({ where: { id: existente.id }, data: fechas }),
        );
      }

      // Plan de trabajo de demo del IV bimestre: actividades publicadas, una subida y una programada.
      const cuartoBimestre = bimestres[3];
      const clase = { cursoId: curso.id, seccionId: seccion.id, bimestreId: cuartoBimestre.id };
      const plan =
        (await tx.planAcademico.findFirst({ where: { ...clase, activo: true } })) ??
        (await tx.planAcademico.create({
          data: {
            ...clase,
            asignacionId: asignacion.id,
            titulo: 'Plan de Matemática – IV Bimestre',
            objetivo: 'Resolver problemas con fracciones y decimales en situaciones cotidianas.',
            fechaInicio: cuartoBimestre.fechaInicio,
            creadoPorId: user.id,
            modificadoPorId: user.id,
          },
        }));
      if (!(await tx.evidenciaPedagogica.count({ where: { planId: plan.id } }))) {
        const actividades = [
          [
            1,
            'EXPOSICION',
            'Presentación de fracciones',
            'Exposición con material concreto.',
            '2026-10-14',
          ],
          [
            2,
            'EJERCICIO',
            'Ficha de fracciones equivalentes',
            'Resolución en parejas.',
            '2026-10-21',
          ],
          [3, 'VIDEO', 'Fracciones en la cocina', 'Video corto y comentario grupal.', '2026-10-28'],
          [
            6,
            'AVANCE_PLAN',
            'Balance de mitad de bimestre',
            'Avance del plan y ajustes.',
            '2026-11-18',
          ],
          // Subida con anticipación, todavía oculta para los alumnos.
          [7, 'EJERCICIO', 'Problemas con decimales', 'Práctica guiada en clase.', null],
          // Programada: los alumnos la verán desde el inicio de la semana 9.
          [9, 'EXPOSICION', 'Exposiciones sobre decimales', 'Grupos de tres.', '2026-12-07'],
        ];
        for (const [numeroSemana, tipo, titulo, descripcion, publicadaDesde] of actividades)
          await tx.evidenciaPedagogica.create({
            data: {
              planId: plan.id,
              numeroSemana,
              tipo,
              titulo,
              descripcion,
              enlaces: tipo === 'VIDEO' ? ['https://www.youtube.com/watch?v=demo-fracciones'] : [],
              publicadaDesde: publicadaDesde && new Date(`${publicadaDesde}T00:00:00Z`),
              creadoPorId: user.id,
              modificadoPorId: user.id,
            },
          });
      }

      // Competencias, regla y evaluaciones de Matemática: la letra del bimestre sale de las notas.
      const competencias = {};
      for (const [codigo, nombre] of [
        ['MAT-03-C1', 'Resuelve problemas de cantidad'],
        ['MAT-03-C2', 'Resuelve problemas de regularidad y cambio'],
      ])
        competencias[codigo] = await tx.competencia.upsert({
          where: { codigo },
          update: {},
          create: { cursoId: curso.id, codigo, nombre, descripcion: nombre },
        });
      if (
        !(await tx.reglaConsolidacion.findFirst({
          where: { gradoId: grado.id, cursoId: curso.id },
        }))
      )
        await tx.reglaConsolidacion.create({
          data: {
            gradoId: grado.id,
            cursoId: curso.id,
            nombre: 'Matemática 3.°',
            version: 1,
            metodo: JSON.stringify({
              estrategia: 'frecuencia',
              desempate: 'reciente',
              minimoNotas: 2,
            }),
            creadoPorId: user.id,
            modificadoPorId: user.id,
          },
        });
      if (!(await tx.evaluacion.count({ where: clase })))
        await sembrarEvaluaciones(tx, {
          clase,
          asignacion,
          competencias,
          estudiantes,
          usuario: user,
        });
      return { roles: 4, alumnos: 5, sesionId: sesion.id, docente: 'Ana Torres', planId: plan.id };
    },
    { timeout: 15000 },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    console.log('Seed completado:', await seed(db));
  } finally {
    await db.$disconnect();
  }
}
