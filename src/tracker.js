import { DEFAULT_RULES, classifyHref, cleanId, defaultPage } from './classify.js';
import { createQueue } from './queue.js';

const DEFAULTS = {
  endpoint: '/collect',
  flushDelay: 5000,
  threshold: 0.5,
  swipePx: 10,
  dedupeMs: 1500,
  idAttr: 'data-track-id',
  itemAttr: 'data-track-item',
  typeAttr: 'data-track',
  rules: DEFAULT_RULES,
  page: defaultPage,
  ignore: null,
  debug: false,
};

// pushState/replaceState don't fire any event, so wrap them (once) to fire one
const NAV_EVENT = 'beacon-tracker:navigate';
let historyPatched = false;

function patchHistory() {
  if (historyPatched) return;
  historyPatched = true;
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(NAV_EVENT));
      return result;
    };
  }
}

function createTracker(cfg) {
  const queue = createQueue(cfg);
  const controller = new AbortController();
  const { signal } = controller;
  const byId = `[${cfg.idAttr}]`;
  const byItem = `[${cfg.itemAttr}]`;
  const byType = `[${cfg.typeAttr}]`;
  const lastClick = new Map();

  let impressions = null;
  let mutations = null;
  let seen = new Set();
  let lastPath = location.pathname;
  let pointerDown = null;

  const currentPage = () => cfg.page(location.pathname);
  const itemOf = (el) => cleanId(el?.getAttribute(cfg.itemAttr));

  function record(event, sendNow) {
    if (cfg.ignore?.(event)) return;
    if (event.type !== 'impression') {
      // double clicks etc
      const key = `${event.id}|${event.item}|${event.type}`;
      const now = Date.now();
      if (now - (lastClick.get(key) ?? 0) < cfg.dedupeMs) return;
      lastClick.set(key, now);
    }
    queue.push(event, sendNow);
  }

  function onIntersect(entries, observer) {
    const page = currentPage();
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      observer.unobserve(el); // only counts once per page view
      const id = cleanId(el.getAttribute(cfg.idAttr));
      if (!id) continue;
      const item = itemOf(el.closest(byItem));
      const key = `${id}:${item}`;
      if (seen.has(key)) continue;
      seen.add(key);
      record({ id, item, page, type: 'impression' }, false);
    }
  }

  function observe(node) {
    if (!impressions || !(node instanceof Element)) return;
    if (node.matches(byId)) impressions.observe(node);
    node.querySelectorAll(byId).forEach((el) => impressions.observe(el));
  }

  function startImpressions() {
    impressions?.disconnect();
    impressions = null;
    seen = new Set();
    lastPath = location.pathname;
    if (!('IntersectionObserver' in window)) return;
    impressions = new IntersectionObserver(onIntersect, { threshold: cfg.threshold });
    observe(document.documentElement);
  }

  function onNavigate() {
    if (location.pathname === lastPath) return;
    queue.flush();
    // give the router a tick to render the new page
    setTimeout(() => {
      if (!signal.aborted) startImpressions();
    }, 0);
  }

  function classifyClick(target) {
    const link = target.closest(`a[href], ${byType}`);
    if (!link) return null;
    // querySelector for the case where the whole card is wrapped in a link
    const card = link.closest(byId) ?? link.querySelector(byId);
    const id = cleanId(card?.getAttribute(cfg.idAttr));
    if (!id) return null;
    const type = cleanId(
      link.getAttribute(cfg.typeAttr) ||
        classifyHref(link.getAttribute('href'), location.href, cfg.rules)
    );
    if (!type) return null;
    const item = itemOf(link.closest(byItem) ?? link.querySelector(byItem));
    return { id, item, type };
  }

  function onClick(event) {
    if (!(event.target instanceof Element)) return;
    // swiping a carousel on mobile still ends with a click, skip those.
    // (keyboard clicks clear pointerDown on keydown, can't rely on
    // event.detail for that, Firefox sets it to 1 for Enter on a link)
    const down = pointerDown;
    pointerDown = null;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > cfg.swipePx) {
      return;
    }
    const hit = classifyClick(event.target);
    if (hit) record({ ...hit, page: currentPage() }, true);
  }

  // capture so we still get clicks when something calls stopPropagation()
  const capture = { capture: true, signal };
  document.addEventListener('pointerdown', (e) => (pointerDown = { x: e.clientX, y: e.clientY }), capture);
  document.addEventListener('keydown', () => (pointerDown = null), capture);
  document.addEventListener('click', onClick, capture);
  // unload isn't reliable on mobile, these are
  document.addEventListener(
    'visibilitychange',
    () => document.visibilityState === 'hidden' && queue.flush(),
    { signal }
  );
  window.addEventListener('pagehide', queue.flush, { signal });
  window.addEventListener('popstate', onNavigate, { signal });
  window.addEventListener(NAV_EVENT, onNavigate, { signal });

  function start() {
    startImpressions();
    // pick up cards added later (load more, filters, popups...)
    mutations = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(observe);
    });
    mutations.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true, signal });
  } else {
    start();
  }

  return {
    flush: queue.flush,
    track(id, type, item) {
      id = cleanId(id);
      type = cleanId(type);
      if (id && type) record({ id, item: cleanId(item), page: currentPage(), type }, true);
    },
    destroy() {
      queue.flush();
      controller.abort();
      impressions?.disconnect();
      mutations?.disconnect();
    },
  };
}

let instance = null;

export function init(options = {}) {
  if (instance || typeof document === 'undefined') return instance;
  const cfg = { ...DEFAULTS };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) cfg[key] = value;
  }
  patchHistory();
  instance = createTracker(cfg);
  return instance;
}

export const track = (id, type, item) => instance?.track(id, type, item);

export const flush = () => instance?.flush();

export function destroy() {
  instance?.destroy();
  instance = null;
}
