const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAPS_HOSTS = new Set(['maps.google.com', 'maps.apple.com', 'maps.app.goo.gl']);

// can be replaced with the `rules` option
export const DEFAULT_RULES = Object.freeze([
  { host: /(^|\.)instagram\.com$/, type: 'click_instagram' },
  { host: /(^|\.)(facebook\.com|fb\.com)$/, type: 'click_facebook' },
  { host: /(^|\.)tiktok\.com$/, type: 'click_tiktok' },
  { host: /(^|\.)(youtube\.com|youtu\.be)$/, type: 'click_youtube' },
  { host: /(^|\.)(x\.com|twitter\.com)$/, type: 'click_x' },
  { host: /(^|\.)linkedin\.com$/, type: 'click_linkedin' },
  { host: /(^|\.)yelp\.[a-z.]+$/, type: 'click_yelp' },
]);

export function cleanId(value) {
  if (value == null) return '';
  const v = String(value).trim();
  return ID_RE.test(v) ? v : '';
}

// /listings/123 and /listings/456 -> /listings/:id
export function defaultPage(pathname) {
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  return p
    .split('/')
    .map((segment) => (/^\d+$/.test(segment) ? ':id' : segment))
    .join('/')
    .slice(0, 100);
}

function isMapsUrl(url) {
  const host = url.hostname.toLowerCase();
  return (
    MAPS_HOSTS.has(host) ||
    (/(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.startsWith('/maps'))
  );
}

export function classifyHref(href, base, rules = DEFAULT_RULES) {
  if (!href) return null;
  if (/^tel:/i.test(href)) return 'click_phone';
  if (/^mailto:/i.test(href)) return 'click_email';

  let url;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isMapsUrl(url)) return 'click_directions';
  if (url.origin === new URL(base).origin) return 'click_link';

  const host = url.hostname.toLowerCase();
  const rule = rules.find((r) => r.host.test(host));
  return rule ? rule.type : 'click_outbound';
}
