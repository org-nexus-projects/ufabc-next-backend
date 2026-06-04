import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';

import { Types } from 'mongoose';

import { TeacherModel } from '@/models/Teacher.js';
import {
  createTeachersSchema,
  listTeachersSchema,
  searchTeacherSchema,
  updateTeacherSchema,
} from '@/schemas/entities/teachers.js';

import {
  findAndUpdate,
  findOne,
  listAll,
  populateWithSubject,
  rawReviews,
  searchMany,
} from './service.js';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  const teachersCache = app.cache<{}>();

  app.get('/', { schema: listTeachersSchema }, async (request) => {
    request.log.debug({}, 'listing all teachers');
    const teachers = await listAll();
    request.log.info({ count: teachers.length }, 'Teachers listed');
    return teachers;
  });

  app.post('/', { schema: createTeachersSchema }, async (request, reply) => {
    const { names } = request.body;

    if (Array.isArray(names)) {
      request.log.debug({ count: names.length }, 'creating teachers (batch)');
      const toInsert = names.map((name) => ({ name }));
      const insertedTeachers = await TeacherModel.create(toInsert);
      request.log.info({ count: insertedTeachers.length }, 'Teachers created');
      return insertedTeachers;
    }

    request.log.debug({ names }, 'creating teacher');
    // @ts-ignore - For now, after executing TS with node directly will be fixed
    const insertedTeacher = await TeacherModel.create({ names });
    request.log.info({ teacherId: insertedTeacher._id }, 'Teacher created');
    return insertedTeacher;
  });

  app.put(
    '/:teacherId',
    { schema: updateTeacherSchema },
    async (request, reply) => {
      const { teacherId } = request.params;
      const { alias } = request.body;

      if (!teacherId) {
        return reply.badRequest('Missing teacherId');
      }

      request.log.debug({ teacherId, alias }, 'updating teacher');
      const updatedTeacher = await findAndUpdate(teacherId, alias);

      if (!updatedTeacher) {
        request.log.warn({ teacherId }, 'Teacher not found for update');
        return reply.badRequest('Teacher not found');
      }

      request.log.info({ teacherId }, 'Teacher updated');
      return updatedTeacher;
    }
  );

  app.get('/search', { schema: searchTeacherSchema }, async (request) => {
    const { q } = request.query;

    request.log.debug({ q }, 'searching teachers');
    const [searchResults] = await searchMany(q);
    request.log.info({ q, count: searchResults?.length ?? 0 }, 'Teacher search completed');

    return searchResults;
  });

  app.get('/reviews/:teacherId', async (request, reply) => {
    const { teacherId } = request.params as { teacherId: string };

    if (!teacherId) {
      return reply.badRequest('Missing SubjectId');
    }

    request.log.debug({ teacherId }, 'fetching teacher reviews');

    const cacheKey = `reviews:${teacherId.toString()}`;
    const cached = teachersCache.get(cacheKey);

    if (cached) {
      request.log.debug({ teacherId }, 'Teacher reviews cache hit');
      return cached;
    }

    request.log.debug({ teacherId }, 'Teacher reviews cache miss, querying DB');

    const validTeacherId = new Types.ObjectId(teacherId);
    const stats = await rawReviews(validTeacherId);
    stats.forEach((s) => {
      s.cr_medio = s.numeric / s.amount;
    });

    const generalDistribution = stats
      .flatMap((stat) => stat.distribution)
      .reduce((acc, dist) => {
        if (!acc[dist.conceito]) {
          acc[dist.conceito] = [];
        }
        acc[dist.conceito].push(dist);
        return acc;
      }, {});

    const generalDistributions = Object.entries(generalDistribution).map(
      ([key, value]) => getMean(value as any, key)
    );

    const teacher = await findOne(teacherId);
    const populatedSubject = await populateWithSubject(stats);
    const resp = {
      teacher,
      general: {
        ...getMean(generalDistributions),
        distribution: generalDistributions,
      },
      specific: populatedSubject,
    };

    teachersCache.set(cacheKey, resp);

    request.log.info({ teacherId, subjectCount: populatedSubject.length }, 'Teacher reviews fetched');
    return resp;
  });
};

function getMean(value: any[], key?: string): any {
  const count = value.reduce((sum, v) => sum + v.count, 0);
  const amount = value.reduce((sum, v) => sum + v.amount, 0);
  const eadCount = value.reduce((sum, v) => sum + v.eadCount, 0);
  const simpleSum = value
    .filter((v) => v.cr_medio != null)
    .reduce((sum, v) => sum + v.amount * v.cr_medio, 0);

  return {
    conceito: key,
    cr_medio: simpleSum / amount,
    cr_professor: value.reduce((sum, v) => sum + v.numericWeight, 0) / amount,
    count,
    eadCount,
    amount: amount,
    numeric: value.reduce((sum, v) => sum + v.numeric, 0),
    numericWeight: value.reduce((sum, v) => sum + v.numericWeight, 0),
    weight: 0, // Added to match the Distribution interface
  };
}

export default plugin;
