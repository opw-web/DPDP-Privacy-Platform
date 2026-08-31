import { FastifyInstance } from 'fastify';
import { openDb } from '../db';
import { requireBearer } from '../auth';
import { onlyGet } from '../methodGate';
import { envelope, parsePageParams } from '../pagination';

/**
 * Marketing system. updated_since behaviour: filters on `subscribed_on`,
 * the obvious timestamp candidate for this system (when the customer
 * subscribed / was last touched by a campaign).
 */
export async function marketingRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/marketing/customers',
    preHandler: [onlyGet, requireBearer('marketing')],
    handler: async (request) => {
      const db = openDb();
      const { page, limit, updatedSince } = parsePageParams(request);
      const offset = (page - 1) * limit;

      const where = updatedSince ? 'WHERE subscribed_on >= ?' : '';
      const params = updatedSince ? [updatedSince] : [];

      const total = (
        db.prepare(`SELECT COUNT(*) AS c FROM marketing_customers ${where}`).get(...params) as {
          c: number;
        }
      ).c;

      const rows = db
        .prepare(
          `SELECT id, customer_email, mobile_number, first_name, surname, city, subscribed_on, campaign_source
           FROM marketing_customers ${where}
           ORDER BY id ASC
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);

      return envelope(rows, total, page, limit);
    },
  });
}
