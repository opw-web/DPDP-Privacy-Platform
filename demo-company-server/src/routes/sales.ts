import { FastifyInstance } from 'fastify';
import { openDb } from '../db';
import { requireBearer } from '../auth';
import { onlyGet } from '../methodGate';
import { envelope, parsePageParams } from '../pagination';

/**
 * Sales/CRM system. updated_since behaviour: this system has NO timestamp
 * column at all (no created/updated/modified field in the messy schema) —
 * `updated_since` is accepted but has no effect; every call returns the
 * full filtered set regardless of the value passed. This is intentional
 * and documented in the README, mirroring a real CRM export API that
 * simply doesn't track row-level modification times.
 */
export async function salesRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/sales/customers',
    preHandler: [onlyGet, requireBearer('sales')],
    handler: async (request) => {
      const db = openDb();
      const { page, limit } = parsePageParams(request);
      const offset = (page - 1) * limit;

      const total = (
        db.prepare('SELECT COUNT(*) AS c FROM sales_customers').get() as { c: number }
      ).c;

      const rows = db
        .prepare(
          `SELECT crm_id, primary_email, contact_no, full_name, billing_pincode, account_status, lifetime_value
           FROM sales_customers
           ORDER BY crm_id ASC
           LIMIT ? OFFSET ?`
        )
        .all(limit, offset);

      return envelope(rows, total, page, limit);
    },
  });
}
