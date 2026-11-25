# beacon-tracker

Small vanilla JS script for counting impressions and clicks on cards/listings. You tag elements with data attributes, include the script, and it batches events and sends them with `sendBeacon`. No dependencies, no cookies, about 2.5 KB gzipped.

I originally built this for a local deals site where each page shows a lot of business listings, and the businesses wanted to know two things: how many people actually saw their listing, and what they did with it (called, got directions, opened their Instagram, etc). This is a cleaned up, standalone version of that.

```html
<article data-track-id="listing-42">
  <h3>Corner Café</h3>
  <a href="tel:+15555550100">Call</a>
  <a href="https://maps.google.com/?q=...">Directions</a>
  <button type="button" data-track="click_book">Book</button>
</article>

<script src="/beacon-tracker.min.js" data-endpoint="/collect" defer></script>
```

An element with `data-track-id` gets one impression per page view once at least 50% of it has been visible. Clicks on links inside it are classified from the href (`tel:` is `click_phone`, Google/Apple Maps is `click_directions`, instagram.com is `click_instagram`, and so on). For buttons or links where the href doesn't tell you anything, set `data-track="..."` yourself.

## Running it

```sh
npm install
npm start       # builds and runs the demo on http://localhost:8080
npm test        # unit tests
npm run build   # outputs dist/beacon-tracker.min.js
```

There are also browser tests with Playwright that run the demo in Chrome, Firefox, Safari (WebKit), and mobile Chrome/Safari viewports. They check things the unit tests can't: that cards only count once they've been on screen, that click types are right, that swipes are ignored but keyboard clicks aren't, and that a real beacon reaches the server.

```sh
npx playwright install   # first time only
npm run test:e2e
```

The demo shows what the collector has received so far, so you can scroll around, load more cards, switch tabs etc. and watch the counts change.

## Usage

With the script tag, it starts on its own if `data-endpoint` is set. Add `data-debug` to log events to the console.

If you're bundling, import it instead:

```js
import { init, track } from 'beacon-tracker';

init({
  endpoint: '/collect',
  flushDelay: 5000,   // wait this long after the first impression before sending
  threshold: 0.5,
  rules: [{ host: /(^|\.)opentable\.com$/, type: 'click_reserve' }],
  page: (pathname) => pathname.split('/')[1] || 'home',
  ignore: (event) => event.id === currentListingId, // e.g. don't count a listing on its own page
});

// for things that aren't clicks, like a form submit
track('42', 'submit_contact_form');
```

There's also `flush()` and `destroy()`.

Attributes:

- `data-track-id` - the thing you're measuring (required)
- `data-track-item` - optional sub item, e.g. a specific offer inside a listing
- `data-track` - explicit event type for a link or button

IDs and types are limited to letters, numbers, `_` and `-` (max 64 chars). Anything else gets ignored.

## Payload

```json
{ "items": [
  { "id": "listing-42", "item": "7", "page": "/listings/:id", "type": "impression" },
  { "id": "listing-42", "item": "", "page": "/listings/:id", "type": "click_phone" }
] }
```

Nothing about the user is sent. Numeric path segments get replaced with `:id` so the page values don't explode.

## Notes on how it works

Impressions use `IntersectionObserver`, plus a `MutationObserver` so cards added later (load more, filters, map popups) get picked up too. I didn't want any scroll listeners or `getBoundingClientRect` calls.

Clicks are one capture-phase listener on `document`. Capture phase so it still sees clicks if some component calls `stopPropagation()`. From the click target it uses `closest()` to find the link and the card it belongs to.

On mobile, swiping through a carousel still fires a click at the end, which was inflating the numbers. So it records where `pointerdown` happened and ignores the click if the pointer moved more than 10px. Keyboard clicks always count; any keydown clears the saved pointer position. I first used `event.detail === 0` to spot keyboard clicks, but the Playwright tests showed Firefox sets `detail` to 1 when you press Enter on a link.

Events are queued and sent together: a few seconds after the first impression, right away on a click, and on `visibilitychange`/`pagehide` (`unload` isn't reliable on mobile). The body is sent as `text/plain` so the request doesn't need a CORS preflight. If `sendBeacon` isn't available it falls back to `fetch` with `keepalive`.

For SPAs, `pushState`/`replaceState` are wrapped to fire an event, and on navigation it flushes and starts counting impressions again for the new page.

## Collector

`server/collect.js` has a `parseBatch(body, userAgent)` function that validates a batch and turns it into daily counts. It also drops bots (crawlers that run JS were a big chunk of impressions before I filtered them). It doesn't do any I/O, so you can use it from whatever backend you have.

`server/server.js` is just a demo server that keeps counts in memory. In production I stored them in Postgres, roughly like this:

```sql
CREATE TABLE activity_daily (
  day   date    NOT NULL,
  id    text    NOT NULL,
  page  text    NOT NULL,
  type  text    NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (day, id, page, type)
);

INSERT INTO activity_daily (day, id, page, type, count)
SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::text[], $5::int[])
ON CONFLICT (day, id, page, type)
DO UPDATE SET count = activity_daily.count + EXCLUDED.count;
```

Only keeping daily totals keeps the table small, which mattered since this ran on every listing page.

## Build / browser support

The source is ES modules. webpack + Babel build `dist/beacon-tracker.min.js` for the browserslist targets in `package.json`. The build fails if the bundle goes over 10 KB, mostly to keep me honest.

Needs `IntersectionObserver`, `MutationObserver`, `AbortController` and `URL`, so any current browser (Safari 15+). If `IntersectionObserver` is missing, clicks still get tracked.

## License

MIT
