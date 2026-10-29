import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, RunStatus } from '../src/digest/types.js';

type Body = { night: string; rows: DigestRow[]; badLines: number; counts: Record<RunStatus, number> };

let runsDir = '';
let app: ReturnType<typeof createApp>;

const line = (at: string, job: string, status: RunStatus, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  const normal = [
    line('2026-10-28T01:00:00+01:00', 'zeta-sync', 'ok', 'anna'),
    line('2026-10-28T01:05:00+01:00', 'alpha-backup', 'retry', 'ben', 'timeout'),
    line('2026-10-28T01:10:00+01:00', 'alpha-backup', 'fail', 'ben', 'disk full'),
    line('2026-10-28T01:15:00+01:00', 'mid-orphan', 'ok', null),
  ];
  fs.writeFileSync(path.join(runsDir, '2026-10-28.jsonl'), normal.join('\n') + '\n');
  fs.writeFileSync(path.join(runsDir, '2026-10-27.jsonl'), '');
  const bad = [
    line('2026-10-26T02:00:00+01:00', 'good-b', 'ok', 'anna'),
    'this is not json {',
    line('2026-10-26T02:05:00+01:00', 'good-a', 'ok', 'ben'),
  ];
  fs.writeFileSync(path.join(runsDir, '2026-10-26.jsonl'), bad.join('\n') + '\n');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page', () => {
  it('renders a normal night in the layout, sorted by job', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html.match(/<table/g)).toHaveLength(1);
    const a = html.indexOf('alpha-backup');
    const m = html.indexOf('mid-orphan');
    const z = html.indexOf('zeta-sync');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(m);
    expect(m).toBeLessThan(z);
    expect(html).toContain('—');
  });

  it('renders — for a null owner and a missing error', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const row = html.slice(html.indexOf('mid-orphan'), html.indexOf('zeta-sync'));
    expect((row.match(/—/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/1999-01-01');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('survives a bad line and still shows the good rows', async () => {
    const res = await app.request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('good-a');
    expect(html).toContain('good-b');
  });
});

describe('digest json', () => {
  it('returns night, rows, badLines and counts', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-backup', 'mid-orphan', 'zeta-sync']);
    expect(body.rows.find((r) => r.job === 'mid-orphan')?.owner).toBeNull();
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/1999-01-01');
    expect(res.status).toBe(404);
  });

  it('gives no rows for the empty night', async () => {
    const body = (await (await app.request('/api/digest/2026-10-27')).json()) as Body;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
  });

  it('counts a bad line without dropping the good rows', async () => {
    const res = await app.request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['good-a', 'good-b']);
  });
});

describe('page and json agree', () => {
  it.each(['2026-10-28', '2026-10-26'])('lists the same jobs in the same order for %s', async (night) => {
    const html = await (await app.request(`/digest/${night}`)).text();
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as Body;
    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
  });
});
