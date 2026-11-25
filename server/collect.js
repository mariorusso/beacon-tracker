// Validates a batch from the tracker and turns it into daily counts.
// No I/O here, the caller decides where to store the rows.

// crawlers that run JS trigger impressions too, and there are a lot of them
export const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|python|curl|wget|httpclient|java\//i;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PAGE_RE = /^\/[A-Za-z0-9_\-/:.]{0,99}$/;

export const MAX_ITEMS = 500;

// opts.types: only accept these event types
// opts.day: YYYY-MM-DD, defaults to today (UTC)
export function parseBatch(text, userAgent, opts = {}) {
  if (!userAgent || BOT_UA.test(userAgent)) return [];

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  if (!body || !Array.isArray(body.items)) return [];

  const day = opts.day ?? new Date().toISOString().slice(0, 10);

  // don't trust the client to dedupe impressions, clicks can repeat though
  const impressions = new Set();
  const totals = new Map();

  for (const raw of body.items.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id ?? '');
    const item = String(raw.item ?? '');
    const page = String(raw.page ?? '');
    const type = String(raw.type ?? '');
    if (!ID_RE.test(id) || (item && !ID_RE.test(item))) continue;
    if (!PAGE_RE.test(page) || !ID_RE.test(type)) continue;
    if (opts.types && !opts.types.has(type)) continue;

    if (type === 'impression') {
      const key = `${id}:${item}:${page}`;
      if (impressions.has(key)) continue;
      impressions.add(key);
    }

    const key = `${id}|${page}|${type}`;
    const row = totals.get(key);
    if (row) row.count += 1;
    else totals.set(key, { day, id, page, type, count: 1 });
  }

  return [...totals.values()];
}
