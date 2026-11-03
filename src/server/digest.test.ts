import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:1/unused';
process.env.BETTER_AUTH_SECRET = 'test-secret';
const { digestMail, unsubscribeUrl, validUnsubscribe } = await import('./digest');

const week = { from: '2026-10-12', to: '2026-10-18', visitors: 12, pageviews: 30, previous: 10, sources: [{ name: 'LinkedIn', visitors: 8 }, { name: 'Direct / none', visitors: 3 }], countries: [{ name: 'Slovakia', visitors: 7 }, { name: 'Czechia', visitors: 3 }] };
const urls = { account: 'https://starring.dev/account', edit: 'https://starring.dev/edit', stage: 'https://starring.dev/jane/', unsubscribe: 'https://starring.dev/api/digest/unsubscribe?u=u1&t=x' };
const to = { email: 'jane@example.com', name: 'Jane' };

test('the digest says who came, the trend and the sources', () => {
  const m = digestMail(to, 'jane', week, urls)!;
  assert.equal(m.subject, '12 people visited your stage last week');
  assert.match(m.body, /Oct 12 to Oct 18/);
  assert.deepEqual(m.rows![0], ['Visitors', '12 · +20% vs the week before']);
  assert.deepEqual(m.rows!.find((r) => r[0] === 'Came from'), ['Came from', 'LinkedIn 8 · Direct / none 3']);
  assert.equal(m.headers!['List-Unsubscribe'], `<${urls.unsubscribe}>`);
  assert.equal(m.headers!['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(m.footer, /Unsubscribe: https:\/\/starring\.dev\/api\/digest\/unsubscribe/);
});

test('singular, quiet and empty weeks', () => {
  assert.equal(digestMail(to, 'jane', { ...week, visitors: 1, previous: 0 }, urls)!.subject, '1 person visited your stage last week');
  assert.deepEqual(digestMail(to, 'jane', { ...week, visitors: 1, previous: 0 }, urls)!.rows![0], ['Visitors', '1 · new this week']);
  const quiet = digestMail(to, 'jane', { ...week, visitors: 0, pageviews: 0, previous: 4, sources: [], countries: [] }, urls)!;
  assert.equal(quiet.subject, 'A quiet week on your stage');
  assert.deepEqual(quiet.rows![0], ['Visitors', '0 · -100% vs the week before']);
  assert.equal(digestMail(to, 'jane', { ...week, visitors: 0, previous: 0 }, urls), null, 'nothing two weeks running → no email');
});

test('what the weekly GitHub check found: a row, or an email of its own in a quiet fortnight', () => {
  assert.deepEqual(digestMail(to, 'jane', week, urls, 3)!.rows!.at(-1), ['New on GitHub', '3 things to add — https://starring.dev/edit']);
  assert.ok(!digestMail(to, 'jane', week, urls)!.rows!.some((r) => r[0] === 'New on GitHub'), 'no row when nothing is new');
  const only = digestMail(to, 'jane', { ...week, visitors: 0, previous: 0 }, urls, 1)!;
  assert.equal(only.subject, 'GitHub has 1 thing to add to your stage');
  assert.equal(only.action.url, 'https://starring.dev/edit');
  assert.match(only.footer, /Unsubscribe/);
});

test('unsubscribe links are signed per user', () => {
  const url = new URL(unsubscribeUrl('https://starring.dev/', 'user-1'));
  assert.equal(url.pathname, '/api/digest/unsubscribe');
  const t = url.searchParams.get('t')!;
  assert.ok(validUnsubscribe('user-1', t));
  assert.ok(!validUnsubscribe('user-2', t), 'not valid for someone else');
  assert.ok(!validUnsubscribe('user-1', t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a')));
  assert.ok(!validUnsubscribe('user-1', ''));
});
