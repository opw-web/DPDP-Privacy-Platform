import Fastify, { FastifyInstance } from 'fastify';
import { healthRoutes } from './routes/health';
import { marketingRoutes } from './routes/marketing';
import { salesRoutes } from './routes/sales';
import { supportRoutes } from './routes/support';
import { ecommerceRoutes } from './routes/ecommerce';
import { stripQuery } from './pagination';

const PORT = 5001;

/**
 * Builds the Fastify app without listening — used by both the real
 * entrypoint and tests (via app.inject()).
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  // Access log: one line per request, method + path with query params
  // stripped (query params can carry personal data, e.g. tokens/emails),
  // plus the final status code. Check 3 watches this during a full sync
  // to prove only GETs arrived.
  app.addHook('onResponse', async (request, reply) => {
    const path = stripQuery(request.raw.url ?? request.url);
    // eslint-disable-next-line no-console
    console.log(`[access] ${request.method} ${path} ${reply.statusCode}`);
  });

  app.register(healthRoutes);
  app.register(marketingRoutes);
  app.register(salesRoutes);
  app.register(supportRoutes);
  app.register(ecommerceRoutes);

  return app;
}

if (require.main === module) {
  const app = buildServer();
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`demo-company-server listening on ${address}`);
  });
}
