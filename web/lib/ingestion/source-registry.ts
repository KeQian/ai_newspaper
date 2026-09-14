import { parse } from 'yaml';

import {
  sourceRegistrySchema,
  type RegistrySource,
  type SourceRegistry,
} from './model';

export type ImportedSource = {
  key: string;
  name: string;
  sourceType: RegistrySource['source_type'];
  reliability: RegistrySource['reliability'];
  url: string;
  enabled: boolean;
  schedule: RegistrySource['schedule'];
  parserKey: string;
  termsStatus: 'approved' | 'review';
  retentionPolicy: 'excerpt';
  owner: string;
  config: Record<string, unknown>;
};

export function parseSourceRegistry(yaml: string): SourceRegistry {
  return sourceRegistrySchema.parse(parse(yaml));
}

export function mapRegistrySources(registry: SourceRegistry): ImportedSource[] {
  return registry.sources.map((source) => ({
    key: source.id,
    name: source.name,
    sourceType: source.source_type,
    reliability: source.reliability,
    url: source.endpoint,
    enabled: source.enabled && source.terms_status !== 'review_before_launch',
    schedule: source.schedule,
    parserKey: source.parser,
    termsStatus:
      source.terms_status === 'review_before_launch' ? 'review' : 'approved',
    retentionPolicy: 'excerpt',
    owner: source.owner,
    config: {
      organization: source.organization,
      category: source.category,
      publicationPolicy: source.publication_policy,
      ...(source.query ? { query: source.query } : {}),
      ...(source.auth_env ? { authEnv: source.auth_env } : {}),
      registryTermsStatus: source.terms_status,
      registryRetention: source.retention,
      fetchPolicy: {
        timezone: registry.defaults.timezone,
        userAgent: registry.defaults.user_agent,
        respectRobots: registry.defaults.respect_robots,
        maxDocumentBytes: registry.defaults.max_document_bytes,
        requestTimeoutSeconds: registry.defaults.request_timeout_seconds,
        retry: registry.defaults.retry,
      },
    },
  }));
}
