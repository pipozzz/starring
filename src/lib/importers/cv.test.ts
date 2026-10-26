import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankProfile, validate, type Profile } from '../model';
import { cvToProfile, mergeCv, type CvDraft } from './cv';

const draft: CvDraft = {
  name: 'Jane Doe',
  role: 'Senior Platform Engineer',
  tagline: 'Keeps production calm for studios and newsrooms.',
  location: 'Bratislava, Slovakia',
  links: { github: 'github.com/JaneDoe', gitlab: null, linkedin: 'https://www.linkedin.com/in/janedoe/', website: 'jane.dev', x: null, email: 'jane@example.com' },
  experience: [
    { company: 'Bright Agency', role: 'Lead DevOps', from: 2019, to: null, current: true, summary: 'Ran platform work for media clients.', clients: ['Northwind Pictures', 'The Weekly Ledger'], stack: ['Kubernetes', 'AWS'] },
    { company: 'Old Co', role: 'Engineer', from: 2015, to: 2012, current: false, summary: null, clients: [], stack: [] },
  ],
  clients: [{ name: 'Northwind Pictures', sector: 'Film & TV' }],
  projects: [
    { title: 'Premiere platform', client: 'Northwind Pictures', year: 2021, role: 'Lead', blurb: 'Global launch platform.', impact: ['18M visits'], stack: ['Go'], url: null, confidential: true },
    { title: 'orbit-ui', client: null, year: 2023, role: null, blurb: 'Design system.', impact: [], stack: [], url: 'https://github.com/jane/orbit-ui', confidential: false },
    { title: 'No blurb', client: null, year: 1800, role: null, blurb: '', impact: [], stack: [], url: 'javascript:alert(1)', confidential: false },
  ],
  education: [{ school: 'STU Bratislava', degree: 'MSc Computer Science', from: 2009, to: 2014 }],
  skills: [{ group: 'Cloud', items: ['AWS', 'AWS', 'Kubernetes'] }, { group: '', items: ['x'] }],
  awards: [{ title: 'Best Streaming Experience', by: 'Craft & Code', year: 2022 }],
  certifications: [{ name: 'CKA', issuer: 'CNCF', year: 2099 }],
  talks: [{ title: 'Calm deploys', kind: 'talk', venue: 'Devfest', year: 2023, url: 'ftp://nope' }],
  languages: [{ name: 'Slovak', level: 'Native' }],
  interests: [{ name: 'Bouldering', note: null }],
  openSource: [
    { project: 'liketrek/TREK', what: 'Slovak translation', url: 'https://github.com/liketrek/TREK/pull/2425', year: 2026 },
    { project: '', what: 'Nameless', url: null, year: null },
  ],
};

test('a CV draft becomes a valid profile: cleaned, NDA-aware, clients collected', () => {
  const { profile: p, notes } = cvToProfile(draft);
  assert.deepEqual(Object.keys(validate(p)), [], 'no validation issues');
  assert.equal(p.handle, 'janedoe', 'handle from the GitHub link');
  assert.deepEqual(p.profile.links, { github: 'https://github.com/JaneDoe', linkedin: 'https://www.linkedin.com/in/janedoe', website: 'https://jane.dev', email: 'mailto:jane@example.com' });
  assert.equal(p.experience![0].to, null, 'current role');
  assert.equal(p.experience![1].to, 2015, 'an end before the start is clamped');
  assert.deepEqual(p.clients!.map((c) => c.name), ['Northwind Pictures', 'The Weekly Ledger'], 'role clients join the wall, no duplicates');
  assert.equal(p.projects![0].visibility, 'nda');
  assert.equal(p.projects![1].visibility, 'public');
  assert.equal(p.projects![1].url, 'https://github.com/jane/orbit-ui');
  assert.equal(p.projects!.length, 2, 'a project without a blurb is dropped');
  assert.deepEqual(p.skills, { Cloud: ['AWS', 'Kubernetes'] });
  assert.equal(p.certifications![0].year, undefined, 'impossible year dropped');
  assert.equal(p.talks![0].url, undefined, 'non-http link dropped');
  assert.deepEqual(p.openSource, [{ repo: 'liketrek/TREK', what: 'Slovak translation', kind: 'translation', url: 'https://github.com/liketrek/TREK/pull/2425', year: 2026 }]);
  assert.ok(notes[0].startsWith('From your CV: 2 roles, 2 projects, 2 clients'), notes[0]);
  assert.ok(notes.some((n) => /NDA/.test(n)));
});

test('garbage from the model never throws and yields a blank, valid profile', () => {
  for (const junk of [{}, { experience: 'nope', projects: [null, 3, { title: 'x' }], links: null }, { name: 42, skills: [{ group: 'A', items: 'b' }] }]) {
    const { profile, notes } = cvToProfile(junk as Partial<CvDraft>);
    assert.deepEqual(Object.keys(validate(profile)).filter((k) => k !== 'handle'), []);
    assert.ok(notes.length >= 1);
  }
  assert.match(cvToProfile({}).notes[0], /Nothing career-shaped/);
});

test('merge keeps what the draft has and appends what is new; fresh keeps handle, theme and commit data', () => {
  const cv = cvToProfile(draft).profile;
  const base: Profile = {
    ...blankProfile(),
    handle: 'jane',
    theme: 'paper',
    profile: { name: 'Jane D.', role: 'What you do', links: { github: 'https://github.com/other' } },
    contributions: [{ year: 2025, public: 10, private: 90 }],
    clients: [{ name: 'northwind pictures', nda: true }],
    projects: [{ title: 'Premiere platform', year: 2021, visibility: 'nda', blurb: 'Mine.' }],
  };
  const merged = mergeCv(base, cv, 'merge');
  assert.equal(merged.profile.name, 'Jane D.', 'a real name is kept');
  assert.equal(merged.profile.role, 'Senior Platform Engineer', 'the placeholder role is filled');
  assert.equal(merged.profile.links?.github, 'https://github.com/other', 'existing links win');
  assert.equal(merged.clients!.length, 2, 'case-insensitive de-duplication');
  assert.equal(merged.projects!.find((x) => x.title === 'Premiere platform')!.blurb, 'Mine.');
  const fresh = mergeCv(base, cv, 'fresh');
  assert.equal(fresh.handle, 'jane');
  assert.equal(fresh.theme, 'paper');
  assert.deepEqual(fresh.contributions, base.contributions);
  assert.equal(fresh.profile.name, 'Jane Doe');
});
