# learn-english

本地英语学习应用：Node + Mastra (Claude) + React 前端。学习数据存于 `data/` 目录并随 git 跟踪。

## 快速开始

```bash
pnpm install
cp .env.example .env   # 填入 ANTHROPIC_API_KEY
pnpm dev               # 同时启动 server 和 web
```

- Server: http://localhost:5174
- Web:    http://localhost:5173

## 目录

- `src/server` — Hono 服务端
- `src/mastra` — agents / tools / workflows
- `src/domain` — schemas、存储、FSRS 调度
- `web/`       — Vite + React 前端
- `data/`      — 学习数据（items / sessions / schedule）

## 环境变量

见 `.env.example`。模型 id 与 base URL 均可配置，便于切换到兼容 Anthropic Messages API 的其他端点。
