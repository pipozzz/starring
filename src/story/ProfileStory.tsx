import { activityGrid, compact, ossHome, ossLogo, totals, heatmap, resolveLang, type OssKind, type Profile, type TalkKind, type Visibility } from '../lib/model';
import { link } from '../lib/url';
import { getStrings, formatNumber } from './i18n';
import './story.css';

const OSS_LABEL: Record<OssKind, string> = { code: 'Code', docs: 'Docs', translation: 'Translation', design: 'Design', maintainer: 'Maintainer' };
const joined = (...xs: (string | number | undefined | null)[]) => xs.filter((x) => x !== undefined && x !== null && x !== '').join(' · ');

interface Props {
  p: Profile;
  /** Editor mode: everything visible at once, sections clickable. */
  preview?: boolean;
  onSection?: (id: string) => void;
  /** Absolute origin of the main site, when the stage is served on its owner's custom domain. */
  site?: string;
}

/**
 * The scroll story. Rendered to static HTML on /[handle] and live in the editor,
 * so what you edit is exactly what ships. Sizes use container units (cqi) so
 * the editor's phone preview behaves like a real phone.
 */
export default function ProfileStory({ p, preview = false, onSection, site }: Props) {
  const lang = resolveLang(p.profile?.lang);
  const s = getStrings(lang);
  const n = (v: number) => formatNumber(v || 0, lang);

  const VIS_LABEL: Record<Visibility, string> = s.visibility;
  const KIND_LABEL: Record<TalkKind, string> = s.talkKind;

  // on a custom domain, links to Starring itself must point at the main site
  const at = (path = '') => (site ? new URL(link(path), site).href : link(path));
  const t = totals(p);
  const me = p.profile ?? { name: '', role: '' };
  const [first, ...rest] = (me.name || ' ').split(' ');
  const contributions = [...(p.contributions ?? [])].sort((a, b) => b.year - a.year);
  const latest = contributions[0];
  const real = latest ? activityGrid(p.activity, latest.year) : null;
  const grid = latest ? real ?? heatmap(p.handle, latest.year, latest.public + latest.private) : [];
  const maxYear = Math.max(1, ...contributions.map((c) => c.public + c.private));
  const clients = (p.clients ?? []).filter((c) => c.name);
  const projects = p.projects ?? [];
  const experience = p.experience ?? [];
  const skills = Object.entries(p.skills ?? {}).filter(([, v]) => v?.length);
  const links = Object.entries(me.links ?? {}).filter(([, v]) => v);
  const platforms = (p.platforms ?? []).filter((pl) => pl.name);
  const hasActivity = !!latest && latest.public + latest.private > 0;
  const awards = (p.awards ?? []).filter((a) => a.title);
  const certs = (p.certifications ?? []).filter((c) => c.name);
  const talks = (p.talks ?? []).filter((x) => x.title);
  const languages = (p.languages ?? []).filter((l) => l.name);
  const interests = (p.interests ?? []).filter((x) => x.name);
  const testimonials = (p.testimonials ?? []).filter((x) => x.quote && x.name);
  const oss = (p.openSource ?? []).filter((x) => x.repo && x.what);

  const sec = (id: string) => ({
    'data-section': id,
    ...(onSection && {
      onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onSection(id); },
      title: 'Click to edit',
    }),
  });
  let act = 0;
  const roman = () => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'][act++];
  const Label = ({ children }: { children: string }) => (
    <h2 className="act-label mono"><span className="num">Act {roman()}</span><span>{children}</span></h2>
  );

  return (
    <div className={`story${preview ? ' is-preview' : ''}`} data-theme={p.theme ?? 'acid'}>
      <header className="hero" {...sec('profile')}>
        <div className="hero-top mono">
          <a href={at()}>Starring</a>
          <span>{me.location}</span>
          {me.available && <span className="tag solid">{s.hero.availableForWork}</span>}
          {!preview && <a className="hero-trailer" href={site ? '/trailer/' : link(`${p.handle}/trailer/`)}>▶ Watch the trailer</a>}
        </div>
        <div className={`hero-main${me.photo ? ' has-photo' : ''}`}>
          <h1 className="display hero-name">
            <span className="line">{first}</span>
            <span className="line accent">{rest.join(' ')}</span>
          </h1>
          {me.photo && (
            <figure className="hero-photo">
              <img src={me.photo} alt={me.name} width={800} height={1000} decoding="async" referrerPolicy="no-referrer" />
            </figure>
          )}
        </div>
        <div className="hero-bottom">
          <p className="hero-role">{me.role}</p>
          <p className="muted hero-tag">{me.tagline}</p>
          <span className="mono scroll-cue">{s.hero.scrollCue}</span>
        </div>
      </header>

      {t.all > 0 && (
        <section className="act" id="numbers" {...sec('contributions')}>
          <Label>{s.numbers.actLabel}</Label>
          <div className="stats">
            {[
              [t.years, s.numbers.yearsShipping(t.years)],
              [t.all, s.numbers.commits(t.all)],
              [t.clients, s.numbers.clients(t.clients)],
              [t.repos, s.numbers.repositories(t.repos)],
            ].map(([v, l]) => (
              <div className="stat reveal" key={String(l)}><b className="display" data-count={v}>{n(v as number)}</b><span className="mono">{l}</span></div>
            ))}
          </div>
          <p className="iceberg reveal">
            <span className="display accent">{t.privateShare}%</span>
            {t.privateShare >= 50 ? s.numbers.icebergHigh : s.numbers.icebergLow}
          </p>
          <div className="split reveal" aria-label={s.numbers.splitAriaLabel}>
            <div className="split-pub" style={{ flex: t.public || 0.0001 }}><span className="mono">{s.numbers.publicLabel} {n(t.public)}</span></div>
            <div className="split-priv" style={{ flex: t.private || 0.0001 }}><span className="mono">{s.numbers.privateLabel} {n(t.private)}</span></div>
          </div>
        </section>
      )}

      {clients.length > 0 && (
        <section className="act act-clients" id="clients" {...sec('clients')}>
          <Label>{s.clientsSection.actLabel}</Label>
          <div className="marquee" aria-hidden="true">
            <div className="marquee-track display">
              {[...clients, ...clients].map((c, i) => <span className="client" key={i}>{c.name}<i>✦</i></span>)}
            </div>
          </div>
          <ul className="client-list">
            {clients.map((c, i) => (
              <li className="reveal" key={i}>
                <span className="client-name">{c.name}</span>
                <span className="muted">{c.sector}</span>
                {c.nda ? <span className="tag">{s.clientsSection.ndaTag}</span> : <span className="tag solid">{s.clientsSection.publicTag}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {experience.length > 0 && (
        <section className="act" id="timeline" {...sec('experience')}>
          <Label>{s.timeline.actLabel}</Label>
          <ol className="timeline">
            {experience.map((e, i) => (
              <li className="tl-item reveal" key={i}>
                <div className="tl-year display">{e.from}<span className="muted">–{e.to ?? s.timeline.now}</span></div>
                <div className="tl-body">
                  <h3>{e.role} <span className="muted">{s.timeline.at} {e.company}</span></h3>
                  {e.summary && <p>{e.summary}</p>}
                  {e.clients?.length ? <p className="mono muted">{s.timeline.clientsPrefix} {e.clients.join(' · ')}</p> : null}
                  <div className="chips">{e.stack?.map((st) => <span className="tag" key={st}>{st}</span>)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {projects.length > 0 && (
        <section className="act" id="work" {...sec('projects')}>
          <Label>{s.work.actLabel}</Label>
          <div className="projects">
            {projects.map((pr, i) => (
              <article className={`project reveal vis-${pr.visibility}`} key={i}>
                <div className="project-meta mono">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span>{pr.year}</span>
                  <span className={pr.visibility === 'public' ? 'tag solid' : 'tag'}>{VIS_LABEL[pr.visibility]}</span>
                </div>
                {pr.image && <img className="project-image" src={pr.image} alt={s.work.screenshot(pr.title)} loading="lazy" decoding="async" />}
                <h3 className="display project-title">{pr.title}</h3>
                {pr.client && <p className="mono">{s.work.forPrefix} <span className="accent">{pr.client}</span>{pr.role && <> · {pr.role}</>}</p>}
                <p className="project-blurb">{pr.blurb}</p>
                {pr.visibility === 'nda' && (
                  <p className="redacted" title={s.work.redactedTitle}>
                    <span>{s.work.redactedSourceCode}</span> <span>{s.work.redactedRepoUrl}</span> <span>{s.work.redactedArchitecture}</span>
                  </p>
                )}
                <ul className="impact">{pr.impact?.map((x) => <li className="display" key={x}>{x}</li>)}</ul>
                <div className="chips">{pr.stack?.map((st) => <span className="tag" key={st}>{st}</span>)}</div>
                {(pr.live || (pr.url && pr.visibility !== 'nda')) && (
                  <p className="project-links mono">
                    {pr.live && <a className="project-link" href={pr.live}>{s.work.seeItLive}</a>}
                    {pr.url && pr.visibility !== 'nda' && <a className="project-link" href={pr.url}>{s.work.viewSource}</a>}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {oss.length > 0 && (
        <section className="act" id="open-source" {...sec('openSource')}>
          <Label>Guest appearances</Label>
          <p className="oss-lede muted reveal">Cameos in other people's open-source productions.</p>
          <ul className="oss">
            {oss.map((x, i) => {
              const logo = ossLogo(x);
              const home = ossHome(x);
              return (
                <li className="reveal" key={i}>
                  <span className="oss-logo" aria-hidden="true">
                    {logo ? <img src={logo} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer" /> : <b className="display">{x.repo.replace(/^.*\//, '').slice(0, 1).toUpperCase()}</b>}
                  </span>
                  <div className="oss-body">
                    <p className="mono oss-repo">
                      {home ? <a href={home}>{x.repo}</a> : x.repo}
                      {!!x.stars && <span className="muted"> ★ {compact(x.stars)}</span>}
                    </p>
                    <h3>{x.url && x.url !== home ? <a href={x.url}>{x.what} ↗</a> : x.what}</h3>
                    <p className="mono muted">{joined(x.kind && OSS_LABEL[x.kind], x.prs && x.prs > 1 ? `${x.prs} merged PRs` : x.prs === 1 ? 'Merged PR' : undefined, x.year)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(awards.length > 0 || certs.length > 0) && (
        <section className="act" id="awards" {...sec(awards.length ? 'awards' : 'certifications')}>
          <Label>{s.accolades.actLabel}</Label>
          {awards.length > 0 && (
            <ul className="awards">
              {awards.map((a, i) => (
                <li className="award reveal" key={i}>
                  <span className="award-mark accent" aria-hidden="true">✦</span>
                  <h3 className="display">{a.url ? <a href={a.url}>{a.title}</a> : a.title}</h3>
                  {(a.by || a.year) && <p className="mono">{joined(a.by, a.year)}</p>}
                  {a.note && <p className="muted">{a.note}</p>}
                </li>
              ))}
            </ul>
          )}
          {certs.length > 0 && (
            <div className="certs" {...sec('certifications')}>
              <p className="mono accent">{s.accolades.certified}</p>
              <ul>
                {certs.map((c, i) => (
                  <li className="reveal" key={i}>
                    <span className="cert-name">{c.name}</span>
                    <span className="mono muted">{joined(c.issuer, c.year)}</span>
                    {c.url && <a className="mono project-link" href={c.url} aria-label={s.accolades.verifyLabel(c.name)}>{s.accolades.verify}</a>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {talks.length > 0 && (
        <section className="act" id="talks" {...sec('talks')}>
          <Label>{s.pressTour.actLabel}</Label>
          <ul className="talks">
            {talks.map((x, i) => (
              <li className="reveal" key={i}>
                <span className="tag">{KIND_LABEL[x.kind ?? 'talk']}</span>
                <h3>{x.url ? <a href={x.url}>{x.title} ↗</a> : x.title}</h3>
                {(x.venue || x.year) && <p className="mono muted">{joined(x.venue, x.year)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(hasActivity || platforms.length > 0) && (
        <section className="act" id="activity" {...sec(hasActivity ? 'contributions' : 'platforms')}>
          <Label>{hasActivity ? s.activity.actLabelActivity : s.activity.actLabelPlatforms}</Label>
          {hasActivity && latest && (
            <>
              <h3 className="display big">{latest.year}<span className="muted"> / {n(latest.public + latest.private)} {s.activity.contributions(latest.public + latest.private)}</span></h3>
              <div className="heat reveal" role="img" aria-label={real ? s.activity.commitsPerDay(latest.year) : s.activity.contributionHeatmap(latest.year)}>
                {grid.map((v, i) => <i className={`l${v}`} key={i} />)}
              </div>
              <div className="years">
                {contributions.map((c) => (
                  <div className="yr reveal" key={c.year}>
                    <span className="mono">{c.year}</span>
                    <div className="yr-bar">
                      <span className="pub" style={{ width: `${(c.public / maxYear) * 100}%` }} />
                      <span className="priv" style={{ width: `${(c.private / maxYear) * 100}%` }} />
                    </div>
                    <span className="mono muted">{c.verified ? s.activity.imported : s.activity.selfReported}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {platforms.length > 0 && (
            <ul className="platforms" {...sec('platforms')}>
              {platforms.map((pl, i) => (
                <li className="reveal" key={i}>
                  <span className="display">{n(pl.commits || pl.repos)}</span>
                  <span className="mono">{pl.name}</span>
                  <span className="mono muted">{pl.commits ? `${n(pl.repos)} ${s.activity.repos(pl.repos)} · ` : `${s.activity.repositoriesLabel} · `}{pl.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {((p.education?.length ?? 0) > 0 || skills.length > 0 || languages.length > 0) && (
        <section className="act" id="training" {...sec('education')}>
          <Label>{s.training.actLabel}</Label>
          <div className="edu-skills">
            <ul className="edu">
              {p.education?.map((ed, i) => (
                <li className="reveal" key={i}>
                  <span className="mono muted">{ed.from}–{ed.to}</span>
                  <h3>{ed.school}</h3>
                  <p className="muted">{ed.degree}</p>
                </li>
              ))}
            </ul>
            <div className="skills" {...sec('skills')}>
              {skills.map(([group, items]) => (
                <div className="reveal" key={group}>
                  <p className="mono accent">{group}</p>
                  <p className="skill-items">{items.join(' / ')}</p>
                </div>
              ))}
              {languages.length > 0 && (
                <div className="reveal" {...sec('languages')}>
                  <p className="mono accent">{s.training.languagesHeader}</p>
                  <p className="skill-items">{languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(' / ')}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {interests.length > 0 && (
        <section className="act" id="offscreen" {...sec('interests')}>
          <Label>{s.behindTheScenes.actLabel}</Label>
          <ul className="interests">
            {interests.map((x, i) => (
              <li className="reveal" key={i}>
                <span className="display interest-name">{x.name}</span>
                {x.note && <span className="muted">{x.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {testimonials.length > 0 && (
        <section className="act" id="critics" {...sec('testimonials')}>
          <Label>{s.critics.actLabel}</Label>
          <div className="quotes">
            {testimonials.map((x, i) => (
              <figure className="quote reveal" key={i}>
                <span className="quote-mark display accent" aria-hidden="true">"</span>
                <blockquote>{x.quote}</blockquote>
                <figcaption className="mono">
                  — {x.url ? <a href={x.url}>{x.name}</a> : x.name}
                  {(x.role || x.company) && <span className="muted">, {[x.role, x.company].filter(Boolean).join(' @ ')}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="credits" id="credits" {...sec('profile')}>
        <p className="mono muted">{s.footer.thatsAWrap}</p>
        <h2 className="display">Starring<br /><span className="accent">{me.name}</span></h2>
        <ul className="mono">
          {links.map(([k, v]) => <li key={k}><a href={v}>{k} ↗</a></li>)}
          {/* on a custom domain the stage is the site root, so the CV is /cv/ there */}
          <li><a href={site ? '/trailer/' : link(`${p.handle}/trailer/`)}>Trailer ▶</a></li>
          <li><a href={site ? '/cv/' : link(`${p.handle}/cv/`)}>CV / PDF ↓</a></li>
        </ul>
        <p className="mono muted">{s.footer.madeWith}</p>
        <p className="mono muted legal-links"><a href={at('terms')}>{s.footer.terms}</a> · <a href={at('privacy')}>{s.footer.privacy}</a></p>
      </footer>
    </div>
  );
}
