import { FastifyRequest } from 'fastify';

export interface PageParams {
  page: number;
  limit: number;
  updatedSince: string | null;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_PAGE = 1;

/** Parses ?page=&limit=&updated_since= with sane defaults/clamping. */
export function parsePageParams(request: FastifyRequest): PageParams {
  const query = request.query as Record<string, string | undefined>;

  let page = Number.parseInt(query.page ?? '', 10);
  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;

  let limit = Number.parseInt(query.limit ?? '', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > 1000) limit = 1000;

  const updatedSince = query.updated_since && query.updated_since.length > 0
    ? query.updated_since
    : null;

  return { page, limit, updatedSince };
}

export function envelope<T>(rows: T[], total: number, page: number, limit: number) {
  return { data: rows, page, limit, total };
}

/** Strips query params from a URL path for access-log purposes. */
export function stripQuery(url: string): string {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}
