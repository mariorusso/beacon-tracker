import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBatch, MAX_ITEMS } from '../server/collect.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130';
const DAY = '2026-01-15';
const body = (items) => JSON.stringify({ items });

test('counts clicks every time and impressions once per element and page', () => {
  const rows = parseBatch(
    body([
      { id: 'a', item: 'x', page: '/', type: 'impression' },
      { id: 'a', item: 'x', page: '/', type: 'impression' }, // duplicate, dropped
      { id: 'a', item: 'y', page: '/', type: 'impression' }, // other item, kept
      { id: 'a', item: '', page: '/', type: 'click_phone' },
      { id: 'a', item: '', page: '/', type: 'click_phone' },
    ]),
    UA,
    { day: DAY }
  );
  assert.deepEqual(rows, [
    { day: DAY, id: 'a', page: '/', type: 'impression', count: 2 },
    { day: DAY, id: 'a', page: '/', type: 'click_phone', count: 2 },
  ]);
});

test('drops bots and missing user agents', () => {
  const b = body([{ id: 'a', page: '/', type: 'impression' }]);
  assert.deepEqual(parseBatch(b, 'Googlebot/2.1'), []);
  assert.deepEqual(parseBatch(b, 'HeadlessChrome/120'), []);
  assert.deepEqual(parseBatch(b, ''), []);
});

test('drops malformed bodies and invalid fields', () => {
  assert.deepEqual(parseBatch('not json', UA), []);
  assert.deepEqual(parseBatch('{"items":5}', UA), []);
  const rows = parseBatch(
    body([
      null,
      { id: '<x>', page: '/', type: 'impression' },
      { id: 'a', page: 'no-slash', type: 'impression' },
      { id: 'a', page: '/', type: 'bad type' },
      { id: 'a', item: '"', page: '/', type: 'impression' },
      { id: 'ok', page: '/p/:id', type: 'click_link' },
    ]),
    UA,
    { day: DAY }
  );
  assert.deepEqual(rows, [{ day: DAY, id: 'ok', page: '/p/:id', type: 'click_link', count: 1 }]);
});

test('optional type allowlist', () => {
  const rows = parseBatch(
    body([
      { id: 'a', page: '/', type: 'click_phone' },
      { id: 'a', page: '/', type: 'click_other' },
    ]),
    UA,
    { day: DAY, types: new Set(['click_phone']) }
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'click_phone');
});

test('reads at most MAX_ITEMS items per request', () => {
  const items = Array.from({ length: MAX_ITEMS + 50 }, () => ({ id: 'a', page: '/', type: 'click_link' }));
  const [row] = parseBatch(body(items), UA, { day: DAY });
  assert.equal(row.count, MAX_ITEMS);
});
