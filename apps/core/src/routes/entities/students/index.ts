import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';

import { ComponentModel } from '@/models/Component.js';
import {
  listMatriculaStudent,
  listStudentSchema,
  listStudentsStatsComponents,
  type MatriculaStudent,
  updateStudentSchema,
} from '@/schemas/entities/students.js';

import {
  getAllCourses,
  getComponentsStudentsStats,
  getStudent,
  update,
} from './service.js';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  app.get(
    '/stats/components',
    { schema: listStudentsStatsComponents },
    async (request, reply) => {
      const { season } = request.query;

      request.log.debug({ season }, 'fetching students stats by component');

      const isPrevious = await ComponentModel.countDocuments({
        season,
        before_kick: { $exists: true, $ne: [] },
      });

      const dataKey = isPrevious ? '$before_kick' : '$alunos_matriculados';
      const statusAggregate = await getComponentsStudentsStats(season, dataKey);

      request.log.info(
        { season, dataKey, resultCount: statusAggregate.length },
        'Students stats fetched',
      );

      return statusAggregate;
    }
  );

  app.get('/courses', async (request) => {
    request.log.debug({}, 'listing all student courses');
    const allStudentsCourses = await getAllCourses();
    request.log.info({ count: allStudentsCourses.length }, 'Student courses listed');
    return allStudentsCourses;
  });

  app.get('/', { schema: listStudentSchema }, async (request, reply) => {
    const login = request.headers['uf-login'];
    const ra = Number(request.headers.ra as string);

    if (!login || !ra) {
      return reply.badRequest('Missing required params');
    }

    request.log.debug({ ra, login }, 'fetching student');

    const student = await getStudent({ ra, login });

    if (!student) {
      request.log.warn({ ra, login }, 'Student not found');
      return reply.notFound('Student not found');
    }

    request.log.info({ ra, studentId: student.aluno_id }, 'Student fetched');

    return {
      studentId: student.aluno_id,
      login: student.login,
      graduations: student.cursos.map((c) => ({
        name: c.nome_curso,
        courseId: c.id_curso,
        shift: c.turno,
        cp: c.cp,
        ca: c.ca,
        cr: c.cr,
        affinity: c.ind_afinidade,
      })),
      updatedAt: student.updatedAt.toISOString(),
    };
  });

  app.get(
    '/student',
    { schema: listMatriculaStudent },
    async (request, reply) => {
      const login = request.headers['uf-login'];

      if (!login) {
        return reply.badRequest('Missing required params');
      }

      request.log.debug({ login }, 'fetching matricula student');

      const student = await getStudent({ login });

      if (!student) {
        request.log.warn({ login }, 'Student not found for matricula');
        return reply.notFound('Student not found');
      }

      request.log.info({ login, studentId: student.aluno_id }, 'Matricula student fetched');

      const matriculaStudent = {
        studentId: student.aluno_id,
        graduations: student.cursos.map((c) => ({
          courseId: c.id_curso,
          name: c.nome_curso,
          shift: c.turno,
          affinity: c.ind_afinidade,
          cp: c.cp ?? 0,
          cr: c.cr ?? 0,
          ca: c.ca ?? 0,
        })),
        updatedAt: student.updatedAt.toISOString(),
      } satisfies MatriculaStudent;

      return matriculaStudent;
    }
  );

  app.put('/', { schema: updateStudentSchema }, async (request, reply) => {
    const { login, ra, studentId, graduationId } = request.body;

    request.log.debug({ login, ra, studentId, graduationId }, 'updating student');

    const updatedStudent = await update({
      login,
      ra,
      studentId,
      graduationId,
    });

    if (!updatedStudent) {
      request.log.warn({ login, ra, studentId }, 'Student not found for update');
      return reply.notFound('Could not find student');
    }

    request.log.info({ login, ra: updatedStudent.ra, studentId }, 'Student updated');

    return updatedStudent;
  });
};

export default plugin;
