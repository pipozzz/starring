import assert from 'node:assert/strict';
import test from 'node:test';
import { credits } from './credits.ts';

const nova = ['Northwind Pictures', 'The Weekly Ledger', 'Halcyon Bank', 'Orbit Mobile', 'Pale Fox Games', 'Kestrel Air'];

test('up to three names, and a count of the rest', () => {
  assert.equal(credits(nova, 80), 'Northwind Pictures · The Weekly Ledger · Halcyon Bank · +3 more');
  assert.equal(credits(['A', 'B'], 80), 'A · B');
  assert.equal(credits(nova, 80, 5), 'Northwind Pictures · The Weekly Ledger · Halcyon Bank · Orbit Mobile · +2 more');
});

test('drops whole names rather than cutting one, and never runs over', () => {
  assert.equal(credits(nova, 50), 'Northwind Pictures · The Weekly Ledger · +4 more');
  assert.equal(credits(nova, 30), 'Northwind Pictures · +5 more');
  for (let budget = 4; budget < 90; budget++) assert.ok(credits(nova, budget).length <= budget, `budget ${budget}`);
});

test('a name too long for the line is shortened with an ellipsis', () => {
  assert.equal(credits(['International Business Machines Corporation'], 20), 'International Busin…');
  assert.equal(credits(['International Business Machines Corporation', 'X'], 24), 'International… · +1 more');
});

test('no clients, no line; blanks and duplicates are ignored', () => {
  assert.equal(credits([], 80), '');
  assert.equal(credits([' ', ''], 80), '');
  assert.equal(credits(['Acme', 'Acme ', '  Globex  '], 80), 'Acme · Globex');
});
