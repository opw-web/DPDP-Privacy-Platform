import { FastifyInstance } from 'fastify';
import { openDb } from '../db';
import { requireBearer } from '../auth';
import { onlyGet } from '../methodGate';
import { envelope, parsePageParams } from '../pagination';

/**
 * E-commerce system. updated_since behaviour: this system has NO
 * modification-timestamp column — `dob` is a date of birth, not an update
 * time, and there is no created/updated field in the messy schema.
 * `updated_since` is accepted but has no effect; every call returns the
 * full filtered set regardless of the value passed. Documented in the
 * README.
 */
export async function ecommerceRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/ecommerce/customers',
    preHandler: [onlyGet, requireBearer('ecommerce')],
    handler: async (request) => {
      const db = openDb();
      const { page, limit } = parsePageParams(request);
      const offset = (page - 1) * limit;

      const total = (
        db.prepare('SELECT COUNT(*) AS c FROM ecommerce_customers').get() as { c: number }
      ).c;

      const rows = db
        .prepare(
          `SELECT customer_code, email, phone_number, first_name, last_name, dob,
                  address_line_1, city, state, pincode, total_orders, total_spent
           FROM ecommerce_customers
           ORDER BY customer_code ASC
           LIMIT ? OFFSET ?`
        )
        .all(limit, offset);

      return envelope(rows, total, page, limit);
    },
  });
}
