#!/usr/bin/env node
// starring — local helpers for your Starring profile (https://starring.dev)
//
//   starring scan [folders…] [options]
//
// Counts the commits YOU authored in local git repositories (client work, company
// GitLab, private repos) and writes starring-activity.json. Only dates and counts are
// written: no code, no commit messages, no repo names, no emails. Nothing is uploaded.
// --check-public is the one exception to "no network": it asks GitHub, GitLab.com and
// Codeberg whether each repo hosted there is public (see visibility.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { defaultEmails, findRepos, remoteUrl, scan } from './scan.mjs';
import { PUBLIC_HOSTS, checkVisibility, remoteRepo } from './visibility.mjs';

const HELP = `starring scan [folders…] [options]

Count your commits in local git repos for your Starring profile.
Writes only dates and counts — no code, messages, repo names or emails. Nothing is uploaded.

Options
  -e, --email <addr>     your commit email (repeatable; default: git config user.email)
      --co-authored      also count commits where your email appears in Co-authored-by trailers
      --check-public     ask GitHub, GitLab.com and Codeberg which of your repos are public, so
                         public work counts as public (one request per repo; the only network
                         use; GITHUB_TOKEN raises GitHub's limit of 60 requests an hour)
      --since <date>     only commits after this date, e.g. 2015-01-01
      --exclude <host>   skip repos hosted here (repeatable), e.g. github.com if the GitHub
                         importer already counts your public work
      --depth <n>        how deep to look for repos (default 6)
  -o, --out <file>       output file (default starring-activity.json; "-" for stdout)
      --reveal-hosts     name self-hosted servers (e.g. git.acme.com) instead of "GitLab (self-hosted)"
  -q, --quiet            no per-repo output
  -v, --version
  -h, --help

Then open your Starring editor → Start from → Import, and drop the file in.

Example
  npx starring-cli scan ~/work ~/clients -e me@agency.com -e me@client.com --exclude github.com`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: 'string', short: 'e', multiple: true },
    'co-authored': { type: 'boolean' },
    'check-public': { type: 'boolean' },
    since: { type: 'string' },
    exclude: { type: 'string', multiple: true },
    depth: { type: 'string' },
    out: { type: 'string', short: 'o' },
    'reveal-hosts': { type: 'boolean' },
    quiet: { type: 'boolean', short: 'q' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
});

if (values.version) {
  console.log(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version);
  process.exit(0);
}

const [command, ...folders] = positionals;
if (values.help || !command) {
  console.log(HELP);
  process.exit(command || values.help ? 0 : 1);
}
if (command !== 'scan') {
  console.error(`Unknown command "${command}".\n\n${HELP}`);
  process.exit(1);
}

const emails = values.email?.length ? values.email : defaultEmails();
const roots = folders.length ? folders : ['.'];
const toStdout = values.out === '-';
const log = (...a) => { if (!toStdout) console.error(...a); };

log(`Looking for git repos in ${roots.join(', ')} …`);
const repos = findRepos(roots, { maxDepth: Number(values.depth ?? 6) });
log(`Found ${repos.length} repos.`);
let visibility;
if (values['check-public']) {
  const hosted = repos.filter((r) => PUBLIC_HOSTS.includes(remoteRepo(remoteUrl(r))?.host));
  log(`Asking ${PUBLIC_HOSTS.join(', ')} which of ${hosted.length} repos are public …`);
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;
  const checked = await checkVisibility(repos, { remoteUrl, token });
  if (checked.limited) {
    // half-known visibility would quietly count public work as private: stop instead
    const { host, resetAt } = checked.limited;
    const when = resetAt ? ` It resets at ${new Date(resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : '';
    const args = process.argv.slice(2).map((a) => (/^[\w@./~:+=-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ');
    console.error(`\n✖ ${host} says too many requests, so it can't say which repos are public.${when}`);
    console.error('  Nothing was written: the result would count public work as private.\n');
    if (host === 'github.com') {
      console.error(token
        ? '  Your GITHUB_TOKEN has hit its limit too — wait for the reset and run it again.'
        : `  Run it again with a GitHub token (it only goes to api.github.com, and lifts the limit from\n  60 to 5,000 requests an hour):\n\n    GITHUB_TOKEN=$(gh auth token) npx starring-cli ${args}\n\n  No gh CLI? Any personal access token works, no scopes needed. Or wait for the reset.`);
    } else {
      console.error('  Wait for the reset and run it again.');
    }
    process.exit(2);
  }
  visibility = checked.visibility;
  const n = (v) => [...visibility.values()].filter((x) => x === v).length;
  log(`  ${n('public')} public, ${n('private')} private${n('unknown') ? `, ${n('unknown')} unknown (the host didn't answer; counted as private)` : ''}`);
}
log(`Counting commits by ${emails.join(', ') || '(no email)'} …\n`);

let result;
try {
  result = scan(repos, {
    emails,
    coauthored: values['co-authored'],
    visibility,
    since: values.since,
    exclude: values.exclude ?? [],
    revealHosts: values['reveal-hosts'],
    onRepo: values.quiet ? undefined : (repo, n, note) => log(`  ${String(n).padStart(6)}  ${repo}${note ? `  — ${note}` : ''}`),
  });
} catch (e) {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
}

const json = JSON.stringify(result, null, 2);
if (toStdout) {
  process.stdout.write(json + '\n');
} else {
  const out = values.out ?? 'starring-activity.json';
  writeFileSync(out, json + '\n');
  const co = result.totals.coauthored ? ` (${result.totals.authored.toLocaleString('en')} authored, ${result.totals.coauthored.toLocaleString('en')} co-authored)` : '';
  const split = visibility ? ` — ${result.totals.public.toLocaleString('en')} in public repos, ${result.totals.private.toLocaleString('en')} in private` : '';
  log(`\n${result.totals.commits.toLocaleString('en')} commits${co} in ${result.totals.repos} repos${split}`);
  for (const y of result.years.slice(0, 8)) log(`  ${y.year}  ${'█'.repeat(Math.max(1, Math.round((y.commits / result.years.reduce((m, x) => Math.max(m, x.commits), 1)) * 30)))} ${y.commits}${visibility ? ` (${y.public} public)` : ''}`);
  for (const p of result.platforms) log(`  ${p.name}${p.kind ? ` (${p.kind})` : ''}: ${p.repos} repos, ${p.commits} commits`);
  if (!visibility && result.platforms.some((p) => ['GitHub', 'GitLab', 'Codeberg'].includes(p.name))) {
    log('\n  Tip: all of these count as private work. If some are public repos, add --check-public');
    log('  so they count as public (it asks GitHub/GitLab/Codeberg which repos are public).');
  }
  log(`\n✓ Wrote ${out} — only dates and counts; open it to check.`);
  log('  Next: Starring editor → Start from → Import YAML / JSON Resume / scan… and drop the file in.');
}
