function send(endpoint, body) {
  try {
    // text/plain so there's no CORS preflight if the collector is on another domain
    const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
    if (navigator.sendBeacon?.(endpoint, blob)) return;
    fetch(endpoint, {
      method: 'POST',
      body,
      keepalive: true,
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    }).catch(() => {});
  } catch {
    // ignore, not worth breaking the page over
  }
}

export function createQueue({ endpoint, flushDelay, debug = false }) {
  let items = [];
  let timer = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (items.length === 0) return;
    const body = JSON.stringify({ items });
    items = [];
    send(endpoint, body);
  }

  function push(event, sendNow = false) {
    items.push(event);
    if (debug) console.log('[beacon-tracker]', event);
    if (sendNow) flush();
    else timer ??= setTimeout(flush, flushDelay);
  }

  return { push, flush };
}
