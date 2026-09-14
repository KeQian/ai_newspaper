import { z } from 'zod';

const entitySuggestionSchema = z
  .object({
    type: z.enum(['company', 'product', 'model', 'person', 'topic']),
    name: z.string().min(1).max(200),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const sourceRelationSchema = z
  .object({
    rawDocumentId: z.string().uuid(),
    relation: z.enum(['primary', 'corroborating', 'signal']),
  })
  .strict();

export const candidateOutputSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    title: z.string().min(1).max(500),
    factSummary: z.string().min(1).max(5000),
    occurredAt: z.string().datetime({ offset: true }).nullable(),
    language: z.literal('zh-CN'),
    verification: z.enum(['confirmed', 'developing', 'unverified']),
    scores: z
      .object({
        importance: z.number().int().min(1).max(5),
        actionability: z.number().int().min(1).max(5),
        novelty: z.number().int().min(1).max(5),
        confidence: z.number().min(0).max(1),
      })
      .strict(),
    entities: z.array(entitySuggestionSchema).max(30),
    sourceRelations: z.array(sourceRelationSchema).min(1).max(50),
    riskFlags: z
      .array(
        z.enum([
          'legal',
          'financial',
          'rumor',
          'conflict',
          'prompt_injection_suspected',
        ]),
      )
      .max(10),
    editorNotes: z.array(z.string().min(1).max(1000)).max(20),
  })
  .strict()
  .superRefine((output, context) => {
    const relationIds = output.sourceRelations.map(
      ({ rawDocumentId }) => rawDocumentId,
    );
    if (new Set(relationIds).size !== relationIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Source relation ids must be unique',
        path: ['sourceRelations'],
      });
    }
    const entityKeys = output.entities.map(
      (entity) => `${entity.type}:${normalizeEntityName(entity.name)}`,
    );
    if (new Set(entityKeys).size !== entityKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Entity suggestions must be unique',
        path: ['entities'],
      });
    }
  });

export type CandidateOutput = z.infer<typeof candidateOutputSchema>;

export function validateCandidateOutput(
  value: unknown,
  allowedRawDocumentIds: ReadonlySet<string>,
): CandidateOutput {
  const output = candidateOutputSchema.parse(value);
  if (
    output.sourceRelations.some(
      ({ rawDocumentId }) => !allowedRawDocumentIds.has(rawDocumentId),
    )
  ) {
    throw new CandidateBusinessValidationError(
      'Source relations must reference only supplied raw documents',
    );
  }
  if (output.sourceRelations.length !== allowedRawDocumentIds.size) {
    throw new CandidateBusinessValidationError(
      'Every supplied raw document must have one source relation',
    );
  }
  return output;
}

export function normalizeEntityName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export class CandidateBusinessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CandidateBusinessValidationError';
  }
}

export function validationIssues(error: unknown): string[] {
  if (error instanceof z.ZodError) {
    return error.issues.slice(0, 20).map((issue) => {
      const path = issue.path.join('.') || 'output';
      return `${path}: ${issue.message}`.slice(0, 500);
    });
  }
  if (error instanceof CandidateBusinessValidationError) {
    return [error.message];
  }
  return ['Candidate generation failed'];
}
