import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestNotFound, DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  // The page and the JSON share this one lookup so they cannot disagree (ADR 0001).
  const nightOf = (id: string) => (/^\d{4}-\d{2}-\d{2}$/.test(id) ? readNight(config.runsDir, id) : null);

  app.get('/digest/:night', (c) => {
    const id = c.req.param('night');
    const night = nightOf(id);
    if (!night) {
      return c.html(
        <Layout title={`digest · ${id}`} lane={lane()}>
          <DigestNotFound night={id} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest · ${id}`} lane={lane()}>
        <DigestPage night={night} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const night = nightOf(c.req.param('night'));
    if (!night) return c.json({ error: 'no such night' }, 404);
    return c.json(night);
  });

  return app;
}
