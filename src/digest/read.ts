import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

const isStatus = (value: unknown): value is RunStatus =>
  typeof value === 'string' && (STATUSES as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRunLine = (value: unknown): value is RunLine =>
  isRecord(value) &&
  typeof value.at === 'string' &&
  typeof value.job === 'string' &&
  isStatus(value.status) &&
  (typeof value.owner === 'string' || value.owner === null) &&
  (value.error === undefined || typeof value.error === 'string');

// Parse one line at the edge: a RunLine, or null when it isn't one.
const parseLine = (line: string): RunLine | null => {
  try {
    const value: unknown = JSON.parse(line);
    return isRunLine(value) ? value : null;
  } catch {
    return null;
  }
};

const toRow = (lines: RunLine[]): DigestRow => {
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  return {
    job: first.job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError: last.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
};

export const readNight: ReadNight = (runsDir, night) => {
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;

  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.values()].map(toRow).sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const result: Night = { night, rows, badLines, counts };
  return result;
};
