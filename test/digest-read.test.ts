import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    if (!night) return;
    expect(night.night).toBe('2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('builds one row per job with retries, last status and times kept verbatim', () => {
    const rows = readNight('runs', '2026-10-28')?.rows ?? [];
    const byJob = (job: string) => rows.find((r) => r.job === job);
    expect(byJob('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', firstAt: '2026-10-28T23:00:06+01:00' });
    expect(byJob('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });

  it('returns null when the night does not exist', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('gives no rows and zero counts for an empty file', () => {
    writeFileSync(join(tmp, '2026-01-01.jsonl'), '');
    expect(readNight(tmp, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts lines of the wrong shape as bad and skips blank lines', () => {
    const lines = [
      '{"at":"2026-01-02T01:00:00+02:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-02T02:00:00+02:00","job":"a","status":"maybe","owner":"x"}',
      '{"job":"b","status":"ok","owner":"x"}',
      '[]',
      '',
      '{"at":"2026-01-02T03:00:00+02:00","job":"a","status":"fail","owner":"x","error":"boom"}',
      '',
    ];
    writeFileSync(join(tmp, '2026-01-02.jsonl'), lines.join('\n'));
    const night = readNight(tmp, '2026-01-02');
    expect(night?.badLines).toBe(3);
    expect(night?.counts).toEqual({ ok: 1, retry: 0, fail: 1 });
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 2,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-01-02T01:00:00+02:00',
        lastAt: '2026-01-02T03:00:00+02:00',
      },
    ]);
  });
});
