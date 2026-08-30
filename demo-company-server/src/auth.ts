import { FastifyReply, FastifyRequest } from 'fastify';

export type System = 'marketing' | 'sales' | 'support' | 'ecommerce';

/**
 * Per-system bearer keys. Exact strings from the spec (§4.8 / lines 931-934).
 * A key valid for one system must never open another — requireBearer()
 * checks against this exact system's key only.
 */
export const SYSTEM_KEYS: Record<System, string> = {
  marketing: 'demo_marketing_readonly_123',
  sales: 'demo_sales_readonly_456',
  support: 'demo_support_readonly_789',
  ecommerce: 'demo_ecom_readonly_012',
};

/**
 * Fastify preHandler factory: requires `Authorization: Bearer <key>` to
 * match exactly the given system's key. Missing header, malformed header,
 * or a key belonging to a different system all produce 401.
 */
export function requireBearer(system: System) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers['authorization'];
    const expected = SYSTEM_KEYS[system];

    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized' });
      return reply;
    }

    const token = header.slice('Bearer '.length).trim();
    if (token !== expected) {
      reply.code(401).send({ error: 'Unauthorized' });
      return reply;
    }
  };
}
