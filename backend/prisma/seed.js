import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pathToFileURL } from 'node:url';
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
        create: { codigo: '2026' },
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
      const bloque = await tx.cursoSeccionDocenteAula.upsert({
        where: { asignacionId_aulaId_diaSemana_horaInicio: bloqueData },
        update: {},
        create: { ...bloqueData, horaFin: '08:45' },
      });
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
        await tx.matricula.upsert({
          where: {
            estudianteId_anioAcademicoId: { estudianteId: student.id, anioAcademicoId: anio.id },
          },
          update: {},
          create: { estudianteId: student.id, anioAcademicoId: anio.id, seccionId: seccion.id },
        });
      }
      return { roles: 4, alumnos: 5, sesionId: sesion.id, docente: 'Ana Torres' };
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
