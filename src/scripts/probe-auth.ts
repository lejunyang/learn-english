// 用 fetch + Bearer 头试一次最小请求，看火山方舟到底要什么鉴权方式
import 'dotenv/config';

const base = process.env.ANTHROPIC_BASE_URL!;
const key = process.env.ANTHROPIC_API_KEY!;

async function tryAuth(label: string, headers: Record<string, string>) {
  const r = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', ...headers },
    body: JSON.stringify({
      model: process.env.MODEL_GENERATOR,
      max_tokens: 30,
      messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
    }),
  });
  const text = await r.text();
  console.log(`\n=== ${label} ===`);
  console.log('status:', r.status);
  console.log('body:', text.slice(0, 400));
}

await tryAuth('x-api-key', { 'x-api-key': key });
await tryAuth('Authorization Bearer', { Authorization: `Bearer ${key}` });
