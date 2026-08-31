import { FastifyInstance } from 'fastify';
import { openDb } from '../db';
import { requireBearer } from '../auth';
import { onlyGet } from '../methodGate';
import { envelope, parsePageParams } from '../pagination';

/**
 * Support/helpdesk system. updated_since behaviour: filters on
 * `last_ticket_at`, the obvious timestamp candidate (when the user's most
 * recent ticket was touched).
 */
export async function supportRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/support/users',
    preHandler: [onlyGet, requireBearer('support')],
    handler: async (request) => {
      const db = openDb();
      const { page, limit, updatedSince } = parsePageParams(request);
      const offset = (page - 1) * limit;

      const where = updatedSince ? 'WHERE last_ticket_at >= ?' : '';
      const params = updatedSince ? [updatedSince] : [];

      const total = (
        db.prepare(`SELECT COUNT(*) AS c FROM support_users ${where}`).get(...params) as {
          c: number;
        }
      ).c;

      const rows = db
        .prepare(
          `SELECT user_ref, email_address, phone, name, last_ticket_at, tickets_count
           FROM support_users ${where}
           ORDER BY user_ref ASC
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);

      return envelope(rows, total, page, limit);
    },
  });
}
