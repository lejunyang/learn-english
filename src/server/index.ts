import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve, type ServerType } from '@hono/node-server';
import { sessionRoutes } from './routes/session.js';
import { itemRoutes } from './routes/items.js';
import { statsRoutes } from './routes/stats.js';
import { configRoutes } from './routes/config.js';

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
app.route('/api/config', configRoutes);

const port = parseInt(process.env.PORT ?? '5174');

let server: ServerType | undefined;

function startServer(attempt = 0): void {
  server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port}`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attempt < 5) {
      // tsx watch 热重启时旧进程释放端口慢一拍，重试几次即可
      const delay = 300 * (attempt + 1);
      console.warn(`[server] port ${port} busy, retry in ${delay}ms (attempt ${attempt + 1}/5)`);
      setTimeout(() => startServer(attempt + 1), delay);
    } else {
      console.error('[server] failed to listen:', err.message);
      process.exit(1);
    }
  });
}

// 收到信号时优雅关闭，避免下一次启动撞端口
function shutdown(signal: string) {
  console.log(`[server] received ${signal}, closing...`);
  server?.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref(); // 兜底
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));

startServer();
