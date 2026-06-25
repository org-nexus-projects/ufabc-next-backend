import { fastifyPlugin as fp } from 'fastify-plugin';
import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import {
  RequestValidationError,
  ResponseSerializationError,
} from 'fastify-zod-openapi';

import { NextError } from '@/errors/base-error.js';

export default fp(
  async (app) => {
    app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      reply.error = error as Error;

      if (error instanceof ResponseSerializationError) {
        reply.status(422);
        reply.send({
          zodIssues: error.validation?.map((err) => err.params.issue) ?? [],
          originalError: error.validation?.[0]?.params.error ?? null,
        });
        return;
      }

      if (error instanceof RequestValidationError || (error && typeof error === 'object' && 'validation' in error && error.validation)) {
        const validationError = error as Error & { validation: unknown[] };

        request.log.warn(
          {
            error: validationError,
            request: {
              method: request.method,
              url: request.url,
              query: request.query,
              params: request.params,
            },
          },
          validationError.message,
        );

        reply.status(400);
        reply.send({
          statusCode: 400,
          error: 'Bad Request',
          message: validationError.message,
          validation: validationError.validation,
        });
        return;
      }

      if (error instanceof NextError) {
        request.log.warn(
          {
            error,
            request: {
              method: request.method,
              url: request.url,
              query: request.query,
              params: request.params,
            },
          },
          error.description,
        );

        const httpBody = error.toHttp();
        reply.status(httpBody.statusCode);
        reply.send(httpBody);
        return;
      }

      if (error instanceof Error) {
        request.log.error(
          {
            error,
            request: {
              method: request.method,
              url: request.url,
              query: request.query,
              params: request.params,
            },
          },
          error.message,
        );

        reply.status(500);
        reply.send({
          error: error.name,
          statusCode: 500,
          message: error.message,
        });
        return;
      }

      if (!error) {
        return;
      }
    });
  },
  { name: 'error-handler' },
);
