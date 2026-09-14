import type {
  SourceRegistryImportResult,
  SourceRegistryRepository,
} from './repository';
import { deriveSourceHealth } from './source-health';
import { mapRegistrySources, parseSourceRegistry } from './source-registry';

export class SourceRegistryService {
  constructor(private readonly repository: SourceRegistryRepository) {}

  async importYaml(
    yaml: string,
    requestId: string,
    now = new Date(),
  ): Promise<SourceRegistryImportResult> {
    const registry = parseSourceRegistry(yaml);
    return this.repository.importSources(
      mapRegistrySources(registry),
      requestId,
      now,
    );
  }

  async listSources(now = new Date()) {
    const sources = await this.repository.listSources();
    return sources.map((source) => ({
      ...source,
      lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
      healthStatus: deriveSourceHealth(source, now),
    }));
  }
}
