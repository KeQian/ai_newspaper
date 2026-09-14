import type { AutomationJobDefinition } from './model';

const SHANGHAI_OFFSET_MINUTES = 8 * 60;
const MAX_CATCH_UP_MINUTES = 24 * 60;

export function latestScheduledWindow(
  definition: AutomationJobDefinition,
  now: Date,
): Date {
  const minute = Math.floor(now.getTime() / 60_000);
  if (definition.minuteOfDayShanghai === null) {
    const aligned =
      Math.floor(minute / definition.cadenceMinutes) *
      definition.cadenceMinutes;
    return new Date(aligned * 60_000);
  }

  const localMinute = minute + SHANGHAI_OFFSET_MINUTES;
  const localDay = Math.floor(localMinute / (24 * 60));
  let scheduledLocalMinute =
    localDay * 24 * 60 + definition.minuteOfDayShanghai;
  if (scheduledLocalMinute > localMinute) scheduledLocalMinute -= 24 * 60;
  return new Date((scheduledLocalMinute - SHANGHAI_OFFSET_MINUTES) * 60_000);
}

export function dueScheduledWindows(input: {
  definition: AutomationJobDefinition;
  now: Date;
  latestScheduledAt: Date | null;
}): Date[] {
  const latest = latestScheduledWindow(input.definition, input.now);
  if (!input.latestScheduledAt) return [latest];

  const cadenceMs = input.definition.cadenceMinutes * 60_000;
  const maximumWindows = Math.max(
    1,
    Math.ceil(MAX_CATCH_UP_MINUTES / input.definition.cadenceMinutes),
  );
  const earliestAllowed = latest.getTime() - (maximumWindows - 1) * cadenceMs;
  const first = Math.max(
    input.latestScheduledAt.getTime() + cadenceMs,
    earliestAllowed,
  );
  const alignedFirst =
    latest.getTime() -
    Math.floor((latest.getTime() - first) / cadenceMs) * cadenceMs;

  const windows: Date[] = [];
  for (
    let timestamp = alignedFirst;
    timestamp <= latest.getTime() && windows.length < maximumWindows;
    timestamp += cadenceMs
  ) {
    if (timestamp > input.latestScheduledAt.getTime()) {
      windows.push(new Date(timestamp));
    }
  }
  return windows;
}

export function isSourceScheduleDue(schedule: string, window: Date): boolean {
  if (schedule === 'hourly') return true;
  if (schedule === 'every_2_hours') {
    const shanghaiHour = (window.getUTCHours() + 8) % 24;
    return shanghaiHour % 2 === 0;
  }
  if (schedule === 'daily_0500') {
    return (
      (window.getUTCHours() + 8) % 24 === 5 && window.getUTCMinutes() === 0
    );
  }
  return false;
}
