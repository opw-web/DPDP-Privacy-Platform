import { FastifyInstance } from 'fastify';

/** GET /health — public, no auth, no method restriction beyond Fastify's own 404. */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return { status: 'ok' };
  });
}
