import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { sessionRoutes } from './routes/session.js';
import { itemRoutes } from './routes/items.js';
import { statsRoutes } from './routes/stats.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }));

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    modelGenerator: process.env.MODEL_GENERATOR || 'claude-sonnet-4-6',
    modelGrader: process.env.MODEL_GRADER || 'claude-haiku-4-5-20251001',
    hasKey: !!process.env.ANTHROPIC_API_KEY,
  }),
);

app.route('/api/session', sessionRoutes);
app.route('/api/items', itemRoutes);
app.route('/api/stats', statsRoutes);

const port = parseInt(process.env.PORT ?? '5174');

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
