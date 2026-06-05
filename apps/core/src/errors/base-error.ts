import { z } from 'zod';

export const errorJsonSchema = z.object({
  title: z.string(),
  code: z.string(),
  httpStatus: z.number(),
  description: z.string(),
  additionalData: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const errorHttpSchema = z.object({
  title: z.string(),
  code: z.string(),
  statusCode: z.number(),
  description: z.string(),
  additionalData: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type ErrorJson = z.infer<typeof errorJsonSchema>;
export type ErrorHttp = z.infer<typeof errorHttpSchema>;

export class NextError extends Error {
  readonly title: string;
  readonly code: string;
  readonly httpStatus: number;
  description: string;
  additionalData: Record<string, unknown> | null | undefined;

  get status(): number {
    return this.httpStatus;
  }

  get statusCode(): number {
    return this.httpStatus;
  }

  constructor(
    title: string,
    code: string,
    httpStatus: number,
    description: string,
    additionalData?: Record<string, unknown> | null,
  ) {
    super(title);
    this.name = 'NextError';
    this.title = title;
    this.description = description;
    this.code = code;
    this.httpStatus = httpStatus;
    this.additionalData = additionalData ?? null;
  }

  toJson(): ErrorJson {
    const json: ErrorJson = {
      title: this.title,
      code: this.code,
      httpStatus: this.httpStatus,
      description: this.description,
      additionalData: this.additionalData ?? null,
    };

    return errorJsonSchema.parse(json);
  }

  toHttp(): ErrorHttp {
    const http: ErrorHttp = {
      title: this.title,
      code: this.code,
      statusCode: this.httpStatus,
      description: this.description,
      additionalData: this.additionalData ?? null,
    };

    return errorHttpSchema.parse(http);
  }
}
