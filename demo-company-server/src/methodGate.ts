import { FastifyReply, FastifyRequest } from 'fastify';

/**
 * preHandler that rejects any method other than GET with 405, before auth
 * even runs. This must run first so that a non-GET request gets 405 even
 * with no/garbage credentials — never 401, never 404 (the route exists).
 */
export async function onlyGet(request: FastifyRequest, reply: FastifyReply) {
  if (request.method !== 'GET') {
    reply.header('Allow', 'GET').code(405).send({ error: 'Method Not Allowed' });
    return reply;
  }
}
