import { Hono } from 'hono';
import { ALLOWED_MODELS, MODEL_IDS } from '../../mastra/provider.js';
import { scenariosByGroup } from '../../domain/tags.js';

export const configRoutes = new Hono();

configRoutes.get('/models', (c) => {
  return c.json({
    models: ALLOWED_MODELS,
    defaults: MODEL_IDS,
  });
});

configRoutes.get('/scenarios', (c) => {
  return c.json({ groups: scenariosByGroup() });
});
