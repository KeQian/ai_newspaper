import {
  ingestionRunInputSchema,
  IngestionConflictError,
  type IngestionRunInput,
} from './model';
import type { IngestionRunRepository } from './repository';
import { createIngestionIdempotencyKey } from './run-idempotency';

export class IngestionRunService {
  constructor(private readonly repository: IngestionRunRepository) {}

  async createOrResume(
    untrustedInput: unknown,
    suppliedIdempotencyKey: string,
    now = new Date(),
  ) {
    const input = ingestionRunInputSchema.parse(untrustedInput);
    const expectedKey = await createIngestionIdempotencyKey(input);

    if (suppliedIdempotencyKey !== expectedKey) {
      throw new IngestionConflictError('Idempotency key does not match input');
    }

    return this.repository.createOrGetRun({
      jobKey: input.jobKey,
      idempotencyKey: expectedKey,
      scheduledAt: new Date(input.scheduledAt),
      sourceKeys: [...input.sources].sort(),
      cursor: input.cursor,
      now,
    });
  }

  async expectedIdempotencyKey(input: IngestionRunInput): Promise<string> {
    return createIngestionIdempotencyKey(input);
  }
}
