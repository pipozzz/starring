import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { exportJsonResume } from './jsonresume-export.ts';
import { importJsonResume } from './jsonresume.ts';
import type { Profile } from '../model.ts';

const nova = parse(readFileSync(new URL('../../../examples/nova.yaml', import.meta.url), 'utf8')) as Profile;
// The official JSON Resume schema (MIT, see fixtures/README.md), pinned so the test runs offline
const schema = JSON.parse(readFileSync(new URL('./fixtures/resume.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const valid = ajv.compile(schema);

test('the export validates against the JSON Resume schema', () => {
  const out = exportJsonResume(nova);
  assert.ok(valid(out), JSON.stringify(valid.errors, null, 2));
});

test('a round trip keeps names, dates and lists', () => {
  const back = importJsonResume(exportJsonResume(nova)).profile;
  assert.equal(back.profile.name, nova.profile.name);
  assert.equal(back.profile.role, nova.profile.role);
  assert.equal(back.profile.location, nova.profile.location);
  assert.equal(back.profile.tagline, nova.profile.tagline);
  assert.equal(back.profile.links?.github, nova.profile.links?.github);
  assert.equal(back.profile.links?.email, nova.profile.links?.email);
  const pick = <T, K extends keyof T>(xs: T[] | undefined, ...keys: K[]) => (xs ?? []).map((x) => keys.map((k) => x[k]));
  assert.deepEqual(pick(back.experience, 'company', 'role', 'from', 'to', 'summary'), pick(nova.experience, 'company', 'role', 'from', 'to', 'summary'));
  assert.deepEqual(pick(back.education, 'school', 'degree', 'from', 'to'), pick(nova.education, 'school', 'degree', 'from', 'to'));
  assert.deepEqual(pick(back.projects, 'title', 'year', 'blurb', 'impact', 'stack'), pick(nova.projects, 'title', 'year', 'blurb', 'impact', 'stack'));
  assert.deepEqual(back.skills, nova.skills);
  for (const key of ['awards', 'certifications', 'talks', 'languages', 'interests'] as const) {
    assert.equal(back[key]?.length ?? 0, nova[key]?.length ?? 0, key);
  }
  assert.deepEqual(back.testimonials?.map((t) => t.name), nova.testimonials?.map((t) => t.name));
});

test('NDA client names never leave', () => {
  const secret = (nova.clients ?? []).filter((c) => c.nda).map((c) => c.name);
  assert.ok(secret.length, 'the sample has NDA clients to test with');
  // put them everywhere a client can appear, too
  const leaky: Profile = {
    ...nova,
    experience: (nova.experience ?? []).map((e) => ({ ...e, clients: secret })),
    projects: [
      ...(nova.projects ?? []),
      { title: 'Public thing', year: 2024, visibility: 'public', blurb: 'x', client: secret[0], url: 'https://example.com/x' },
      { title: 'Quiet thing', year: 2024, visibility: 'nda', blurb: 'y', client: 'Anyone', url: 'https://example.com/y', live: 'https://example.com/live' },
    ],
  };
  const out = exportJsonResume(leaky) as { work?: { name: string }[] };
  // an employer stays an employer (a CV can't hide where you worked); clients are what NDA covers
  const json = JSON.stringify({ ...out, work: out.work?.map(({ name: _employer, ...rest }) => rest) });
  for (const name of secret) assert.ok(!json.includes(name), `${name} leaked`);
  assert.ok(!json.includes('Anyone') && !json.includes('example.com/y') && !json.includes('example.com/live'), 'NDA project keeps only its story');
  assert.ok(json.includes('Quiet thing'), 'but the NDA project itself is listed');
});

test('a blank stage exports a minimal valid resume', () => {
  const out = exportJsonResume({ handle: 'x', profile: { name: 'X', role: 'Dev' } });
  assert.ok(valid(out), JSON.stringify(valid.errors));
  assert.deepEqual(Object.keys(out), ['$schema', 'basics', 'meta']);
});
