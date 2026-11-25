import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHref, defaultPage, cleanId } from '../src/classify.js';

const BASE = 'https://shop.example/listings/7';

test('classifyHref: phone, email, maps', () => {
  assert.equal(classifyHref('tel:+15555550100', BASE), 'click_phone');
  assert.equal(classifyHref('MAILTO:a@b.c', BASE), 'click_email');
  assert.equal(classifyHref('https://www.google.com/maps/search/?api=1&query=x', BASE), 'click_directions');
  assert.equal(classifyHref('https://www.google.ca/maps/place/x', BASE), 'click_directions');
  assert.equal(classifyHref('https://maps.apple.com/?q=x', BASE), 'click_directions');
});

test('classifyHref: google.com outside /maps is just outbound', () => {
  assert.equal(classifyHref('https://www.google.com/search?q=x', BASE), 'click_outbound');
});

test('classifyHref: known sites, same origin, other sites', () => {
  assert.equal(classifyHref('https://www.instagram.com/someone', BASE), 'click_instagram');
  assert.equal(classifyHref('https://youtu.be/abc', BASE), 'click_youtube');
  assert.equal(classifyHref('/listings/8', BASE), 'click_link');
  assert.equal(classifyHref('https://shop.example/about', BASE), 'click_link');
  assert.equal(classifyHref('https://example.org/', BASE), 'click_outbound');
});

test('classifyHref: custom rules replace the defaults', () => {
  const rules = [{ host: /(^|\.)example\.org$/, type: 'click_partner' }];
  assert.equal(classifyHref('https://www.example.org/', BASE, rules), 'click_partner');
  assert.equal(classifyHref('https://instagram.com/', BASE, rules), 'click_outbound');
});

test('classifyHref: ignores empty, script and unparseable hrefs', () => {
  assert.equal(classifyHref('', BASE), null);
  assert.equal(classifyHref(null, BASE), null);
  assert.equal(classifyHref('javascript:void(0)', BASE), null);
  assert.equal(classifyHref('http://[bad', BASE), null);
});

test('defaultPage groups numeric segments and trims slashes', () => {
  assert.equal(defaultPage('/'), '/');
  assert.equal(defaultPage(''), '/');
  assert.equal(defaultPage('/listings/123/'), '/listings/:id');
  assert.equal(defaultPage('/listings/abc'), '/listings/abc');
});

test('cleanId accepts short id-like strings only', () => {
  assert.equal(cleanId(' 42 '), '42');
  assert.equal(cleanId('listing-7'), 'listing-7');
  assert.equal(cleanId('<script>'), '');
  assert.equal(cleanId('x'.repeat(65)), '');
  assert.equal(cleanId(undefined), '');
});
