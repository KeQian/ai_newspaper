import { z } from 'zod';

export const automationJobKeySchema = z.enum([
  'official-source-radar',
  'developer-ecosystem-radar',
  'research-digest',
]);

export type AutomationJobKey = z.infer<typeof automationJobKeySchema>;

export type AutomationJobDefinition = {
  key: AutomationJobKey;
  cadenceMinutes: number;
  minuteOfDayShanghai: number | null;
  categories: readonly string[];
};

export const automationJobs: Record<AutomationJobKey, AutomationJobDefinition> =
  {
    'official-source-radar': {
      key: 'official-source-radar',
      cadenceMinutes: 60,
      minuteOfDayShanghai: null,
      categories: ['model_platform'],
    },
    'developer-ecosystem-radar': {
      key: 'developer-ecosystem-radar',
      cadenceMinutes: 60,
      minuteOfDayShanghai: null,
      categories: ['developer_ecosystem', 'open_models', 'standards'],
    },
    'research-digest': {
      key: 'research-digest',
      cadenceMinutes: 24 * 60,
      minuteOfDayShanghai: 5 * 60,
      categories: ['research'],
    },
  };

export class AutomationLeaseUnavailableError extends Error {
  constructor(message = 'Automation job is already running') {
    super(message);
    this.name = 'AutomationLeaseUnavailableError';
  }
}

export class AutomationNoSourcesError extends Error {
  constructor(message = 'No approved sources are due for this job') {
    super(message);
    this.name = 'AutomationNoSourcesError';
  }
}
