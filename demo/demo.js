// Note the tracker isn't referenced here (except the flush button), the
// listings just have data-track-* attributes on them.

const listingsEl = document.querySelector('#listings');
const belowFoldEl = document.querySelector('#below-fold');
const statsBody = document.querySelector('#stats-body');
const statsEmpty = document.querySelector('#stats-empty');
const announcer = document.querySelector('#announcer');

let nextNumber = 1;

// small createElement helper, strings get added as text nodes
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== false && value != null) el.setAttribute(name, value === true ? '' : value);
  }
  el.append(...children);
  return el;
}

// screen readers get "Call, Listing 3" instead of a bunch of identical "Call" links
function actionLink(label, listing, href, external = false) {
  return h(
    'a',
    external ? { href, target: '_blank', rel: 'noopener' } : { href },
    label,
    h('span', { class: 'visually-hidden' }, `, ${listing}${external ? ' (opens in a new tab)' : ''}`)
  );
}

function createListing() {
  const n = nextNumber++;
  const name = `Listing ${n}`;
  const hasOffer = n % 2 === 1;
  const titleId = `listing-${n}-title`;

  const article = h(
    'article',
    {
      class: 'card',
      'aria-labelledby': titleId,
      'data-track-id': `listing-${n}`,
      'data-track-item': hasOffer ? `offer-${n}` : null,
    },
    h('h3', { id: titleId }, name),
    hasOffer
      ? h('p', { class: 'card__offer' }, `Offer ${n}: 2 for 1 after 3 pm`)
      : h('p', { class: 'muted' }, 'No current offer'),
    h(
      'ul',
      { class: 'card__actions', role: 'list' },
      h('li', {}, actionLink('Call', name, 'tel:+15555550100')),
      h('li', {}, actionLink('Directions', name, 'https://www.google.com/maps/search/?api=1&query=coffee', true)),
      h('li', {}, actionLink('Instagram', name, 'https://www.instagram.com/', true)),
      h('li', {}, actionLink('Website', name, 'https://example.com/', true)),
      // no href, so the type has to be set
      h('li', {}, h('button', { type: 'button', 'data-track': 'click_book', class: 'link-button' }, 'Book', h('span', { class: 'visually-hidden' }, `, ${name}`)))
    )
  );
  return h('li', {}, article);
}

function addListings(list, count) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) fragment.append(createListing());
  list.append(fragment);
}

function announce(message) {
  announcer.textContent = message;
}

function showPath() {
  document.querySelector('#current-path').textContent = location.pathname;
}


document.querySelector('#load-more').addEventListener('click', () => {
  addListings(listingsEl, 2);
  announce('2 listings added.');
});

document.querySelector('#navigate').addEventListener('click', () => {
  const next = location.pathname === '/' ? '/listings/2' : '/';
  history.pushState({}, '', next);
  renderPage();
  announce(`Showing listings on ${next}.`);
});

document.querySelector('#flush').addEventListener('click', () => {
  window.BeaconTracker?.flush();
  announce('Queued events sent.');
});

window.addEventListener('popstate', renderPage);

// fake "new page"
function renderPage() {
  showPath();
  listingsEl.replaceChildren();
  addListings(listingsEl, 4);
  document.querySelector('#listings-heading').focus();
}


function renderStats(rows) {
  statsEmpty.hidden = rows.length > 0;
  statsBody.replaceChildren(
    ...rows.map((row) =>
      h(
        'tr',
        {},
        h('td', {}, row.id),
        h('td', {}, row.type),
        h('td', {}, h('code', {}, row.page)),
        h('td', { class: 'num' }, String(row.count))
      )
    )
  );
}

async function refreshStats() {
  try {
    const response = await fetch('/stats', { cache: 'no-store' });
    if (response.ok) renderStats(await response.json());
  } catch {
    // server probably not running
  }
}

// stop polling while the tab is hidden
let pollTimer = null;
function poll() {
  clearTimeout(pollTimer);
  if (document.hidden) return;
  refreshStats().finally(() => {
    pollTimer = setTimeout(poll, 1500);
  });
}
document.addEventListener('visibilitychange', poll);


showPath();
addListings(listingsEl, 4);
addListings(belowFoldEl, 4);
poll();
