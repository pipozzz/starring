import { useState } from 'react';
import { THIS_YEAR, type Issues, type Profile } from '../lib/model';
import { resolveSnippet } from '../lib/plausible';
import { link } from '../lib/url';
import { DEFAULT_THEME, THEMES, getTheme } from '../themes';
import ListEditor from './ListEditor';
import { Area, Chips, Combo, Num, Segmented, Text, Toggle } from './fields';

export interface SectionProps {
  p: Profile;
  up: (patch: Partial<Profile>) => void;
  issues: Issues;
  notify: (msg: string, undo?: boolean) => void;
}

const has = (issues: Issues, prefix: string) => Object.keys(issues).some((k) => k.startsWith(prefix));

const LINK_KEYS = ['github', 'gitlab', 'linkedin', 'website', 'x', 'email'];

export function ProfileSection({ p, up, issues }: SectionProps) {
  const me = p.profile;
  const set = (patch: Partial<Profile['profile']>) => up({ profile: { ...me, ...patch } });
  const links = me.links ?? {};
  const linkKeys = [...new Set([...LINK_KEYS.filter((k) => k in links || ['github', 'linkedin', 'email'].includes(k)), ...Object.keys(links)])];
  return (
    <>
      <div className="ed-grid">
        <Text label="Name" value={me.name} onChange={(name) => set({ name })} error={issues['profile.name']} hint="First word goes white, the rest gets the accent" wide />
        <Text label="Role" value={me.role} onChange={(role) => set({ role })} error={issues['profile.role']} wide />
        <Area label="Tagline" value={me.tagline} onChange={(tagline) => set({ tagline })} max={120} placeholder="One line people remember." wide />
        <Text label="Location" value={me.location} onChange={(location) => set({ location })} placeholder="City, Country" />
        <Text
          label="Handle"
          value={p.handle}
          onChange={(h) => up({ handle: h.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
          error={issues.handle}
          hint={`${location.host}${link(p.handle)}`}
        />
        <div className="wide">
          <Toggle label="Available for work" hint="Shows a badge in the hero" checked={me.available} onChange={(available) => set({ available })} />
        </div>
      </div>

      <h3 className="ed-sub">Theme</h3>
      <div className="ed-themes" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => {
          const on = (p.theme ?? DEFAULT_THEME) === t.id;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={on}
              key={t.id}
              data-theme={t.id}
              className={`ed-theme${on ? ' on' : ''}`}
              onClick={() => up({ theme: t.id })}
              title={`${t.description} — by ${t.author.name}`}
            >
              <span className="ed-theme-sample display">{t.name}</span>
              <span className="ed-theme-chips" aria-hidden="true">
                <i style={{ background: t.tokens.fg }} />
                <i style={{ background: t.tokens.accent }} />
                <i style={{ background: t.tokens.muted }} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="ed-hint ed-theme-more">
        {getTheme(p.theme).description} <a href={link('themes')} target="_blank" rel="noreferrer">All themes ↗</a>
      </p>

      <h3 className="ed-sub">Links</h3>
      <div className="ed-grid">
        {linkKeys.map((k) => (
          <Text
            key={k}
            label={k}
            value={links[k]}
            placeholder={k === 'email' ? 'mailto:you@example.com' : 'https://'}
            error={issues[`profile.links.${k}`]}
            onChange={(v) => {
              const next = { ...links, [k]: k === 'email' && v && !v.startsWith('mailto:') && v.includes('@') ? `mailto:${v}` : v };
              if (!v) delete next[k];
              set({ links: next });
            }}
          />
        ))}
      </div>

      <h3 className="ed-sub">Analytics — your own Plausible</h3>
      <p className="ed-hint">See who visits your stage in your <a href="https://plausible.io" target="_blank" rel="noreferrer">Plausible</a> (cloud or self-hosted). Add a site there, then paste the snippet it gives you — Starring reads the site and server out of it. Only a page view is sent; no script from your Plausible runs on this page.</p>
      <PlausibleSnippet onSite={(site) => up({ analytics: { plausible: site } })} />
      <div className="ed-grid">
        <Text
          label="Plausible site"
          value={p.analytics?.plausible?.domain}
          placeholder="starring.dev/you"
          error={issues['analytics.plausible.domain']}
          onChange={(domain) => up({ analytics: { plausible: { ...p.analytics?.plausible, domain: domain.trim() } } })}
        />
        <Text
          label="Plausible server"
          value={p.analytics?.plausible?.host}
          placeholder="https://plausible.io"
          hint="Leave empty for plausible.io"
          error={issues['analytics.plausible.host']}
          onChange={(host) => up({ analytics: { plausible: { domain: p.analytics?.plausible?.domain ?? '', ...(host.trim() && { host: host.trim() }) } } })}
        />
      </div>
    </>
  );
}

/** Paste Plausible's install snippet → fills the site and server fields below. */
function PlausibleSnippet({ onSite }: { onSite: (site: { domain: string; host?: string }) => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<{ busy?: boolean; ok?: string; error?: string }>({});
  const read = async (value: string) => {
    if (!value.trim()) return setState({});
    setState({ busy: true });
    const r = await resolveSnippet(value);
    if ('error' in r) return setState({ error: r.error });
    onSite(r.site);
    setState({ ok: `Found ${r.site.domain} on ${r.site.host ?? 'plausible.io'}` });
  };
  return (
    <Area
      label="Plausible snippet"
      wide
      value={text}
      placeholder={'<script async src="https://plausible.io/js/pa-….js"></script>…'}
      error={state.error}
      hint={state.busy ? 'Reading…' : state.ok ? `✓ ${state.ok}` : 'Paste it here — or fill in the two fields below by hand'}
      onChange={(v) => { setText(v); void read(v); }}
    />
  );
}

export function NumbersSection({ p, up }: SectionProps) {
  const rows = [...(p.contributions ?? [])];
  const max = Math.max(1, ...rows.map((r) => (r.public || 0) + (r.private || 0)));
  const nextYear = rows.length ? Math.min(...rows.map((r) => r.year)) - 1 : THIS_YEAR - 1;
  return (
    <>
      <p className="ed-lead">Commits per year. Private = work in client or company repos that GitHub can't show.</p>
      <p className="ed-hint">
        For the real heatmap, run <code>npx starring-cli scan ~/code</code> on your machine and drop the <code>starring-activity.json</code> it writes onto this editor. It counts commits locally; only dates and counts leave your machine.
      </p>
      <div className="ed-table">
        <div className="ed-tr ed-th"><span>Year</span><span>Public</span><span>Private</span><span>Imported</span><span /></div>
        {rows.map((r, i) => {
          const set = (patch: Partial<typeof r>) => up({ contributions: rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div className="ed-tr" key={i}>
              <input className="ed-input" type="number" value={r.year} onChange={(e) => set({ year: Number(e.target.value) })} aria-label="Year" />
              <input className="ed-input" type="number" min={0} value={r.public} onChange={(e) => set({ public: Number(e.target.value) })} aria-label="Public commits" />
              <input className="ed-input" type="number" min={0} value={r.private} onChange={(e) => set({ private: Number(e.target.value) })} aria-label="Private commits" />
              <input type="checkbox" checked={!!r.verified} onChange={(e) => set({ verified: e.target.checked })} aria-label="Imported" />
              <button type="button" className="ed-x" aria-label="Remove year" onClick={() => up({ contributions: rows.filter((_, j) => j !== i) })}>✕</button>
              <div className="ed-bar" aria-hidden="true">
                <span style={{ width: `${(r.public / max) * 100}%` }} className="pub" />
                <span style={{ width: `${(r.private / max) * 100}%` }} className="priv" />
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="ed-add" onClick={() => up({ contributions: [...rows, { year: nextYear, public: 0, private: 0, verified: false }] })}>
        + Add {nextYear}
      </button>
    </>
  );
}

export function PlatformsSection({ p, up, notify }: SectionProps) {
  return (
    <ListEditor
      items={p.platforms ?? []}
      onChange={(platforms) => up({ platforms })}
      make={() => ({ name: 'GitLab', kind: 'private' as const, repos: 0, commits: 0 })}
      title={(x) => x.name}
      meta={(x) => `${x.commits.toLocaleString('en')} commits · ${x.kind}`}
      addLabel="Add platform"
      empty="Where does your code live? GitHub, self-hosted GitLab, Bitbucket…"
      onRemove={(x) => notify(`Removed ${x.name}`, true)}
      render={(x, set) => (
        <div className="ed-grid">
          <Combo label="Name" value={x.name} onChange={(name) => set({ name })} options={['GitHub', 'GitLab', 'GitLab (self-hosted)', 'Bitbucket', 'Azure DevOps', 'Gitea']} wide />
          <Segmented label="Visibility" value={x.kind} onChange={(kind) => set({ kind })} options={[{ id: 'public', label: 'Public' }, { id: 'private', label: 'Private' }]} />
          <Num label="Repositories" value={x.repos} min={0} onChange={(repos) => set({ repos })} />
          <Num label="Commits" value={x.commits} min={0} onChange={(commits) => set({ commits })} />
        </div>
      )}
    />
  );
}

export function ClientsSection({ p, up, issues, notify }: SectionProps) {
  return (
    <>
      <p className="ed-lead">Names only, as text — no logos. Mark NDA when you may say the name but not show the work.</p>
      <ListEditor
        items={p.clients ?? []}
        onChange={(clients) => up({ clients })}
        make={() => ({ name: '', sector: '', nda: true })}
        title={(x) => x.name}
        meta={(x) => (x.nda ? <span className="ed-pill">NDA</span> : <span className="ed-pill on">Public</span>)}
        addLabel="Add client"
        empty="Who trusted you with production?"
        invalid={(i) => has(issues, `clients.${i}.`)}
        onRemove={(x) => notify(`Removed ${x.name || 'client'}`, true)}
        render={(x, set, i) => (
          <div className="ed-grid">
            <Text label="Name" value={x.name} onChange={(name) => set({ name })} error={issues[`clients.${i}.name`]} />
            <Combo label="Sector" value={x.sector} onChange={(sector) => set({ sector })} options={['Film & TV', 'Media & Publishing', 'Fintech', 'Retail', 'Healthcare', 'Gaming', 'Telco', 'Aviation', 'Public sector']} />
            <div className="wide"><Toggle label="Under NDA" hint="Hides links on projects for this client" checked={x.nda} onChange={(nda) => set({ nda })} /></div>
          </div>
        )}
      />
    </>
  );
}

export function ExperienceSection({ p, up, issues, notify }: SectionProps) {
  const clientNames = (p.clients ?? []).map((c) => c.name).filter(Boolean);
  return (
    <ListEditor
      items={p.experience ?? []}
      onChange={(experience) => up({ experience })}
      make={() => ({ company: '', role: '', from: THIS_YEAR, to: null, summary: '', clients: [], stack: [] })}
      title={(x) => (x.role && x.company ? `${x.role} @ ${x.company}` : x.company || x.role)}
      meta={(x) => `${x.from}–${x.to ?? 'now'}`}
      addLabel="Add role"
      empty="Your timeline. Newest first works best."
      invalid={(i) => has(issues, `experience.${i}.`)}
      onRemove={(x) => notify(`Removed ${x.company || 'role'}`, true)}
      render={(x, set, i) => (
        <div className="ed-grid">
          <Text label="Company" value={x.company} onChange={(company) => set({ company })} error={issues[`experience.${i}.company`]} />
          <Text label="Role" value={x.role} onChange={(role) => set({ role })} error={issues[`experience.${i}.role`]} />
          <Num label="From" value={x.from} min={1970} max={THIS_YEAR} onChange={(from) => set({ from })} />
          {x.to === null ? (
            <div className="ed-field"><span className="ed-label">To</span><span className="ed-now">Present</span></div>
          ) : (
            <Num label="To" value={x.to} min={1970} max={THIS_YEAR} onChange={(to) => set({ to })} error={issues[`experience.${i}.to`]} />
          )}
          <div className="wide"><Toggle label="I still work here" checked={x.to === null} onChange={(now) => set({ to: now ? null : THIS_YEAR })} /></div>
          <Area label="Summary" value={x.summary} onChange={(summary) => set({ summary })} max={160} wide />
          <Chips label="Clients" value={x.clients} onChange={(clients) => set({ clients })} suggestions={clientNames} wide hint="Pick from your clients or type a new one" />
          <Chips label="Stack" value={x.stack} onChange={(stack) => set({ stack })} wide />
        </div>
      )}
    />
  );
}

export function ProjectsSection({ p, up, issues, notify }: SectionProps) {
  const clients = p.clients ?? [];
  return (
    <ListEditor
      items={p.projects ?? []}
      onChange={(projects) => up({ projects })}
      make={() => ({ title: '', client: '', year: THIS_YEAR, visibility: 'nda' as const, role: '', blurb: '', impact: [], stack: [] })}
      title={(x) => x.title}
      meta={(x) => <span className={`ed-pill${x.visibility === 'public' ? ' on' : ''}`}>{x.visibility}</span>}
      addLabel="Add project"
      empty="The work you're proudest of — public or not."
      invalid={(i) => has(issues, `projects.${i}.`)}
      onRemove={(x) => notify(`Removed ${x.title || 'project'}`, true)}
      render={(x, set, i) => (
        <div className="ed-grid">
          <Text label="Title" value={x.title} onChange={(title) => set({ title })} error={issues[`projects.${i}.title`]} wide />
          <Combo
            label="Client"
            value={x.client}
            options={clients.map((c) => c.name)}
            onChange={(client) => {
              const known = clients.find((c) => c.name === client);
              set(known?.nda && x.visibility === 'public' ? { client, visibility: 'nda' } : { client });
            }}
          />
          <Num label="Year" value={x.year} min={1970} max={THIS_YEAR + 1} onChange={(year) => set({ year })} />
          <Segmented
            label="Visibility"
            value={x.visibility}
            onChange={(visibility) => set(visibility === 'nda' ? { visibility, url: undefined } : { visibility })}
            options={[
              { id: 'public', label: 'Open source', hint: 'Links to the code' },
              { id: 'private', label: 'Private repo', hint: 'Code is closed, details are fine' },
              { id: 'nda', label: 'Under NDA', hint: 'Redacted bars, no links' },
            ]}
          />
          <Text label="Your role" value={x.role} onChange={(role) => set({ role })} />
          {x.visibility !== 'nda' && <Text label="Source code" value={x.url} onChange={(url) => set({ url: url || undefined })} placeholder="https://github.com/…" error={issues[`projects.${i}.url`]} />}
          <Text label="Live" value={x.live} onChange={(live) => set({ live: live || undefined })} placeholder="https://" hint="The site, app or demo people can try — fine for NDA work that's public" error={issues[`projects.${i}.live`]} />
          <Text label="Image" value={x.image} onChange={(image) => set({ image: image || undefined })} placeholder="https://…/screenshot.png" hint="A screenshot or poster (https). Only what you're allowed to show." error={issues[`projects.${i}.image`]} wide />
          <Area label="Blurb" value={x.blurb} onChange={(blurb) => set({ blurb })} max={180} error={issues[`projects.${i}.blurb`]} wide />
          <Chips label="Impact" value={x.impact} onChange={(impact) => set({ impact })} placeholder="18M visits, +23% conversion…" hint="Short and numeric hits hardest" wide />
          <Chips label="Stack" value={x.stack} onChange={(stack) => set({ stack })} wide />
        </div>
      )}
    />
  );
}

export function EducationSection({ p, up, issues, notify }: SectionProps) {
  return (
    <ListEditor
      items={p.education ?? []}
      onChange={(education) => up({ education })}
      make={() => ({ school: '', degree: '', from: THIS_YEAR - 4, to: THIS_YEAR })}
      title={(x) => x.school}
      meta={(x) => `${x.from}–${x.to}`}
      addLabel="Add school"
      empty="University, high school, bootcamp, certifications."
      invalid={(i) => has(issues, `education.${i}.`)}
      onRemove={(x) => notify(`Removed ${x.school || 'school'}`, true)}
      render={(x, set, i) => (
        <div className="ed-grid">
          <Text label="School" value={x.school} onChange={(school) => set({ school })} error={issues[`education.${i}.school`]} wide />
          <Text label="Degree / track" value={x.degree} onChange={(degree) => set({ degree })} wide />
          <Num label="From" value={x.from} onChange={(from) => set({ from })} />
          <Num label="To" value={x.to} onChange={(to) => set({ to })} />
        </div>
      )}
    />
  );
}

export function SkillsSection({ p, up, issues, notify }: SectionProps) {
  const groups = Object.entries(p.skills ?? {}).map(([name, items]) => ({ name, items }));
  const save = (gs: { name: string; items: string[] }[]) =>
    up({ skills: Object.fromEntries(gs.map((g, i) => [g.name || `Group ${i + 1}`, g.items])) });
  return (
    <>
    <ListEditor
      items={groups}
      onChange={save}
      make={() => ({ name: `Group ${groups.length + 1}`, items: [] })}
      title={(g) => g.name}
      meta={(g) => `${g.items.length} skills`}
      addLabel="Add skill group"
      empty="Group skills, e.g. Frontend / Platform / Delivery."
      onRemove={(g) => notify(`Removed ${g.name}`, true)}
      render={(g, set) => (
        <div className="ed-grid">
          <Text label="Group" value={g.name} onChange={(name) => set({ name })} wide />
          <Chips label="Skills" value={g.items} onChange={(items) => set({ items })} wide />
        </div>
      )}
    />
    <h3 className="ed-sub">Languages</h3>
    <ListEditor
      items={p.languages ?? []}
      onChange={(languages) => up({ languages })}
      make={() => ({ name: '', level: '' })}
      title={(x) => x.name}
      meta={(x) => x.level ?? ''}
      addLabel="Add language"
      empty="The languages you work in — a big deal for international teams."
      invalid={(i) => has(issues, `languages.${i}.`)}
      onRemove={(x) => notify(`Removed ${x.name || 'language'}`, true)}
      render={(x, set, i) => (
        <div className="ed-grid">
          <Text label="Language" value={x.name} onChange={(name) => set({ name })} error={issues[`languages.${i}.name`]} />
          <Combo label="Level" value={x.level} options={['Native', 'Fluent', 'Professional', 'Conversational', 'Basic', 'C2', 'C1', 'B2', 'B1']} onChange={(level) => set({ level: level || undefined })} />
        </div>
      )}
    />
    </>
  );
}

export function AccoladesSection({ p, up, issues, notify }: SectionProps) {
  return (
    <>
      <p className="ed-lead">Awards, hackathon wins, "employee of the year", a feature in a magazine — and the certifications that back up your stack.</p>
      <h3 className="ed-sub">Awards & recognition</h3>
      <ListEditor
        items={p.awards ?? []}
        onChange={(awards) => up({ awards })}
        make={() => ({ title: '', by: '', year: THIS_YEAR })}
        title={(x) => x.title}
        meta={(x) => (x.year ? String(x.year) : '')}
        addLabel="Add award"
        empty="Nothing yet? Hackathons, internal awards and press features count."
        invalid={(i) => has(issues, `awards.${i}.`)}
        onRemove={(x) => notify(`Removed ${x.title || 'award'}`, true)}
        render={(x, set, i) => (
          <div className="ed-grid">
            <Text label="Award" value={x.title} onChange={(title) => set({ title })} placeholder="Best Developer Tool 2024" error={issues[`awards.${i}.title`]} wide />
            <Text label="Given by" value={x.by} onChange={(by) => set({ by: by || undefined })} placeholder="Product Hunt, your company, a conference…" />
            <Num label="Year" value={x.year} min={1950} max={THIS_YEAR + 1} onChange={(year) => set({ year })} error={issues[`awards.${i}.year`]} />
            <Text label="Link" value={x.url} onChange={(url) => set({ url: url || undefined })} placeholder="https://" error={issues[`awards.${i}.url`]} />
            <Text label="One line about it" value={x.note} onChange={(note) => set({ note: note || undefined })} wide />
          </div>
        )}
      />
      <h3 className="ed-sub">Certifications</h3>
      <ListEditor
        items={p.certifications ?? []}
        onChange={(certifications) => up({ certifications })}
        make={() => ({ name: '', issuer: '', year: THIS_YEAR })}
        title={(x) => x.name}
        meta={(x) => x.issuer ?? ''}
        addLabel="Add certification"
        empty="AWS, Kubernetes, Terraform, Scrum — with a verify link if there is one."
        invalid={(i) => has(issues, `certifications.${i}.`)}
        onRemove={(x) => notify(`Removed ${x.name || 'certification'}`, true)}
        render={(x, set, i) => (
          <div className="ed-grid">
            <Text label="Certification" value={x.name} onChange={(name) => set({ name })} placeholder="AWS Certified Solutions Architect – Professional" error={issues[`certifications.${i}.name`]} wide />
            <Text label="Issuer" value={x.issuer} onChange={(issuer) => set({ issuer: issuer || undefined })} placeholder="Amazon Web Services" />
            <Num label="Year" value={x.year} min={1950} max={THIS_YEAR + 1} onChange={(year) => set({ year })} error={issues[`certifications.${i}.year`]} />
            <Text label="Verify link" value={x.url} onChange={(url) => set({ url: url || undefined })} placeholder="https://www.credly.com/badges/…" error={issues[`certifications.${i}.url`]} wide />
          </div>
        )}
      />
    </>
  );
}

const TALK_KINDS = [
  { id: 'talk', label: 'Talk' },
  { id: 'article', label: 'Article' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'video', label: 'Video' },
  { id: 'book', label: 'Book' },
] as const;

const OSS_KINDS = [
  { id: 'code', label: 'Code' },
  { id: 'docs', label: 'Docs' },
  { id: 'translation', label: 'Translation' },
  { id: 'design', label: 'Design' },
  { id: 'maintainer', label: 'Maintainer' },
] as const;

export function OpenSourceSection({ p, up, issues, notify }: SectionProps) {
  return (
    <>
      <p className="ed-lead">Your cameos in other people's projects: a merged PR, a translation, docs, a maintainer role. Big names here say a lot. <b>Import from GitHub</b> finds your merged pull requests for you.</p>
      <ListEditor
        items={p.openSource ?? []}
        onChange={(openSource) => up({ openSource })}
        make={() => ({ repo: '', what: '', kind: 'code' as const, year: THIS_YEAR })}
        title={(x) => x.repo}
        meta={(x) => <span className="ed-pill">{x.kind ?? 'code'}</span>}
        addLabel="Add contribution"
        empty="E.g. liketrek/TREK — Slovak translation, or kubernetes/website — docs fixes."
        invalid={(i) => has(issues, `openSource.${i}.`)}
        onRemove={(x) => notify(`Removed ${x.repo || 'contribution'}`, true)}
        render={(x, set, i) => (
          <div className="ed-grid">
            <Text label="Project" value={x.repo} onChange={(repo) => set({ repo })} placeholder="owner/name" hint="owner/name on GitHub shows the project's logo" error={issues[`openSource.${i}.repo`]} />
            <Num label="Year" value={x.year} min={1950} max={THIS_YEAR + 1} onChange={(year) => set({ year })} error={issues[`openSource.${i}.year`]} />
            <Text label="What you did" value={x.what} onChange={(what) => set({ what })} placeholder="Slovak translation" error={issues[`openSource.${i}.what`]} wide />
            <Segmented label="Kind" value={x.kind ?? 'code'} onChange={(kind) => set({ kind })} options={OSS_KINDS.map((k) => ({ ...k }))} />
            <Num label="Merged PRs" value={x.prs} min={0} max={100000} onChange={(prs) => set({ prs: prs || undefined })} />
            <Text label="Link" value={x.url} onChange={(url) => set({ url: url || undefined })} placeholder="https://github.com/owner/name/pull/123" error={issues[`openSource.${i}.url`]} wide />
            <Text label="Logo (optional)" value={x.logo} onChange={(logo) => set({ logo: logo || undefined })} placeholder="https://… — GitHub projects get theirs automatically" error={issues[`openSource.${i}.logo`]} wide />
          </div>
        )}
      />
    </>
  );
}

export function TalksSection({ p, up, issues, notify }: SectionProps) {
  return (
    <ListEditor
      items={p.talks ?? []}
      onChange={(talks) => up({ talks })}
      make={() => ({ title: '', kind: 'talk' as const, venue: '', year: THIS_YEAR })}
      title={(x) => x.title}
      meta={(x) => <span className="ed-pill">{x.kind ?? 'talk'}</span>}
      addLabel="Add talk or article"
      empty="Conference talks, meetups, blog posts, podcasts you were on, videos, a book."
      invalid={(i) => has(issues, `talks.${i}.`)}
      onRemove={(x) => notify(`Removed ${x.title || 'item'}`, true)}
      render={(x, set, i) => (
        <div className="ed-grid">
          <Text label="Title" value={x.title} onChange={(title) => set({ title })} error={issues[`talks.${i}.title`]} wide />
          <Segmented label="Kind" value={x.kind ?? 'talk'} onChange={(kind) => set({ kind })} options={TALK_KINDS.map((k) => ({ ...k }))} />
          <Text label="Where" value={x.venue} onChange={(venue) => set({ venue: venue || undefined })} placeholder="KubeCon EU, Smashing Magazine, Syntax.fm…" />
          <Num label="Year" value={x.year} min={1950} max={THIS_YEAR + 1} onChange={(year) => set({ year })} error={issues[`talks.${i}.year`]} />
          <Text label="Link" value={x.url} onChange={(url) => set({ url: url || undefined })} placeholder="https://" error={issues[`talks.${i}.url`]} wide />
        </div>
      )}
    />
  );
}

export function InterestsSection({ p, up, issues, notify }: SectionProps) {
  return (
    <>
      <p className="ed-lead">The person behind the commits. People hire people — a hobby is often what they remember and ask about.</p>
      <ListEditor
        items={p.interests ?? []}
        onChange={(interests) => up({ interests })}
        make={() => ({ name: '', note: '' })}
        title={(x) => x.name}
        addLabel="Add interest"
        empty="Climbing, sourdough, synths, chess, a podcast you run…"
        invalid={(i) => has(issues, `interests.${i}.`)}
        onRemove={(x) => notify(`Removed ${x.name || 'interest'}`, true)}
        render={(x, set, i) => (
          <div className="ed-grid">
            <Text label="Interest" value={x.name} onChange={(name) => set({ name })} placeholder="Trail running" error={issues[`interests.${i}.name`]} />
            <Text label="One line (optional)" value={x.note} onChange={(note) => set({ note: note || undefined })} placeholder="Two ultramarathons, one more to go" />
          </div>
        )}
      />
    </>
  );
}

export function TestimonialsSection({ p, up, issues, notify }: SectionProps) {
  return (
    <>
      <p className="ed-lead">What colleagues and clients say about working with you. Use real quotes, with permission — a LinkedIn recommendation is a good source.</p>
      <ListEditor
        items={p.testimonials ?? []}
        onChange={(testimonials) => up({ testimonials })}
        make={() => ({ quote: '', name: '', role: '', company: '' })}
        title={(x) => x.name || x.quote.slice(0, 40)}
        meta={(x) => x.company ?? ''}
        addLabel="Add testimonial"
        empty="One or two short quotes beat a page of praise."
        invalid={(i) => has(issues, `testimonials.${i}.`)}
        onRemove={(x) => notify(`Removed quote from ${x.name || 'someone'}`, true)}
        render={(x, set, i) => (
          <div className="ed-grid">
            <Area label="Quote" value={x.quote} onChange={(quote) => set({ quote })} max={400} error={issues[`testimonials.${i}.quote`]} wide />
            <Text label="Name" value={x.name} onChange={(name) => set({ name })} error={issues[`testimonials.${i}.name`]} />
            <Text label="Role" value={x.role} onChange={(role) => set({ role: role || undefined })} placeholder="CTO" />
            <Text label="Company" value={x.company} onChange={(company) => set({ company: company || undefined })} />
            <Text label="Link to them" value={x.url} onChange={(url) => set({ url: url || undefined })} placeholder="https://linkedin.com/in/…" error={issues[`testimonials.${i}.url`]} />
          </div>
        )}
      />
    </>
  );
}
