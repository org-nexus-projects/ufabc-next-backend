import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';

import { currentQuad } from '@next/common';

import { listUserEnrollments } from '@/schemas/entities/enrollments.js';

import {
  findComment,
  findOne,
  listByRa,
  listWithComponents,
} from './service.js';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  app.get('/', { schema: listUserEnrollments }, async (request, reply) => {
    const { ra } = request.user;
    request.log.debug({ ra }, 'listing enrollments');
    const userEnrollments = await listByRa(ra);
    request.log.info({ ra, count: userEnrollments.length }, 'Enrollments listed');
    return userEnrollments;
  });

  app.get('/wpp', async (request, reply) => {
    const { season, ra } = request.query as {
      season: ReturnType<typeof currentQuad>;
      ra: string;
    };

    const actualSeason = season ?? currentQuad();
    const resolvedRa = request.user?.ra ?? ra;
    const raSource = request.user?.ra ? 'jwt' : 'query';

    request.log.debug({ ra: resolvedRa, season: actualSeason, raSource }, 'listing wpp enrollments');

    const wppEnrollments = await listWithComponents(resolvedRa, actualSeason);

    request.log.info(
      { ra: resolvedRa, season: actualSeason, raSource, count: wppEnrollments.length },
      'WPP enrollments listed',
    );
    return wppEnrollments;
  });

  app.get('/:enrollmentId', async (request, reply) => {
    const { enrollmentId } = request.params as { enrollmentId: string };
    request.log.debug({ enrollmentId, ra: request.user.ra }, 'fetching enrollment');

    const enrollment = await findOne(enrollmentId, request.user.ra);

    if (!enrollment) {
      request.log.warn({ enrollmentId, ra: request.user.ra }, 'Enrollment not found');
      return reply.badRequest('Enrollment not found');
    }

    const comments = await findComment(enrollmentId);

    if (!comments) {
      request.log.warn({ enrollmentId }, 'No comments found for enrollment');
      return reply.badRequest('No comments were found');
    }

    comments.forEach((c) => {
      // @ts-expect-error for now
      enrollment[c.type].comment = c;
    });

    request.log.info(
      { enrollmentId, ra: request.user.ra, commentCount: comments.length },
      'Enrollment fetched',
    );
    const { ra, ...res } = enrollment;
    return res;
  });
};

export default plugin;
