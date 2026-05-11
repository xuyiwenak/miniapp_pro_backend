const PAGE_MIN = 1;
const PAGE_SIZE_MIN = 1;

export interface PageParams {
  page: number;
  pageSize: number;
}

/**
 * Parses `page` and `pageSize` from query strings, clamping to valid ranges.
 */
export function parsePage(
  query: Record<string, unknown>,
  defaultSize: number,
  maxSize: number,
): PageParams {
  const page = Math.max(PAGE_MIN, parseInt(String(query['page'] ?? '1'), 10) || PAGE_MIN);
  const pageSize = Math.min(
    maxSize,
    Math.max(PAGE_SIZE_MIN, parseInt(String(query['pageSize'] ?? String(defaultSize)), 10) || defaultSize),
  );
  return { page, pageSize };
}
