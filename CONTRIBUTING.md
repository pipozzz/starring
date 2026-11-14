# Contributing to Starring

Thanks for taking a look. Starring aims to be the place developers show their whole career, so contributions that help more people tell their story are the most welcome.

## Setup

```bash
git clone https://github.com/pipozzz/starring.git
cd starring
npm install
npm run dev        # http://localhost:4321, editor at /edit
```

Requires Node 22.22 or newer. There's no database and no environment variables. Sample profiles live in `examples/`.

Before opening a PR, run:

```bash
npm run check          # types for .astro / .ts / .tsx
npm test               # unit tests (node --test)
npm run check:themes   # theme id, WCAG contrast, scoped CSS
npm run build          # static build
npm run test:a11y      # axe-core in headless Chrome: main pages + the sample profile in every theme
```

Touching server mode (`src/server/`, auth, the DB)? Also run:

```bash
npm run db:up && export DATABASE_URL=postgres://starring:starring@127.0.0.1:5440/starring
npm run db:migrate && npm run build:server
node dist/server/entry.mjs &   # then:
npm run test:e2e               # sign-up → claim → save → publish → delete, plus security guards
```

### What CI runs on your PR

| Job | What it checks |
| --- | --- |
| `check` | `astro check` (types), theme lint, no whitespace errors |
| `test` | Unit tests: model, SEO/JSON-LD, GitHub and JSON Resume importers |
| `build` | Static build, **accessibility** (axe-core on the main pages and every theme, 0 violations allowed), static build under `/starring` (catches hard-coded links), server build |
| `e2e` | Server build against Postgres. Migrations must be committed, then the full account → publish flow runs |
| `docker` | The self-hosting image builds |

All five must pass before a PR can merge into `main`. On your first PR, a maintainer approves the workflow run first (GitHub's protection for forks).

Tests live next to the code (`*.test.ts`) and run with Node's built-in test runner. New importer? Add a test with a mocked `fetch`, as `src/lib/importers/github.test.ts` does.

## Where things live

| Path | What |
| --- | --- |
| `src/lib/model.ts` | The `Profile` type, validation and derived numbers. It's browser-safe and shared by everything. |
| `src/lib/profiles.ts` | `ProfileStore`, which reads YAML from `profiles/` (falling back to `examples/`). |
| `src/lib/importers/` | Importers. Each one turns an external source into a `Profile`. |
| `src/story/` | `ProfileStory`, the scroll story. It's used by both the static pages and the editor preview. |
| `src/themes/` | Themes, one folder each, plus the registry (`index.ts`) and the contract (`define.ts`). |
| `src/editor/` | The visual editor (React, client-only). |
| `src/pages/` | Astro routes: `/`, `/[handle]`, `/edit`, `/themes`. |

## Ground rules

- **The story renders statically.** `ProfileStory` must not need client JS to show content. Animations are progressive enhancement.
- **Use container units in the story.** Use `cqi` and `@container`, not `vw` and `@media`, so the editor's phone preview stays truthful.
- **Build internal links with `link()`** from `src/lib/url.ts`, never as a literal `"/..."`.
- **Privacy first.** Importers send data only to the source they import from. Nothing about a user's private repos (code, messages, repo names) is ever sent anywhere unless the user explicitly opts in.
- **Never use client logos or brand assets** in examples. Use fictional company names.
- **Keep the schema backwards compatible.** New profile fields must be optional, so existing YAML keeps working.

## Good first contributions

### Add an importer

Create `src/lib/importers/<source>.ts` and export an async function that returns `{ profile, notes }`, following the pattern in `github.ts`:

- Accept an optional `base` profile and merge into it. Don't wipe clients, the timeline or NDA projects.
- Throw an `Error` with a message a person can act on, such as "rate limit hit — add a token".
- Return `notes` that tell the user what to fill in next.

Then add it to the editor's *Start from* menu.

### Add a theme

This is the easiest way to contribute, and every theme shows up in the [gallery](https://starring.dev/themes/) with your name on it.

```bash
npm run new:theme -- noir "Film Noir"
npm run dev   # open /themes and /edit?from=nova&theme=noir
```

That creates `src/themes/noir/` with two files:

- **`theme.ts`**: `defineTheme({ id, name, description, author, scheme, tokens, fonts })`.
  - `tokens` are 7 colours: `bg`, `fg`, `muted`, `line`, `accent`, `accentInk`, `redact`.
  - `fonts` are Google Fonts families for `display`, `body` and `mono`.
  - It's picked up automatically, with no registry to edit.
- **`style.css`** (optional): anything the tokens can't express, such as scanlines, glow, marquee bulbs or italic serifs. Scope every selector to `[data-theme='noir']`. See `vhs/`, `broadway/` and `paper/` for examples.

**Checklist for a theme PR:**
- Text is readable: `fg` on `bg` and `accentInk` on `accent` pass WCAG AA (4.5:1). `npm run build && npm run test:a11y` checks the whole profile in your theme, including `muted` text and tags, and CI runs it too.
- It looks right at phone width. Use the editor's phone preview.
- NDA redaction bars (`redact`) are visible on `bg`.
- Motion respects `prefers-reduced-motion`.
- The PR includes a screenshot of the hero and of one act.

### Add a language

Story labels are translatable via `src/story/i18n/`. Adding a language takes one file:

1. Copy `src/story/i18n/en.ts` to `src/story/i18n/<lang>.ts` (use a BCP 47 tag, e.g. `de.ts`, `fr.ts`, `pt.ts`).
2. Translate each string in your new file. Keep the TypeScript structure unchanged.
3. Add your language to `SUPPORTED_LANGS` in `src/lib/model.ts`.
4. Import and register your dictionary in `src/story/i18n/index.ts`.
5. Run `npm run check` — a missing key fails the build, so the compiler catches incomplete translations.

The type `I18nStrings` in `en.ts` defines the shape. Your translation file should use `satisfies I18nStrings` so any missing or mistyped key causes a type error.

**Plural forms:** Use `Intl.PluralRules` for plurals — see the existing functions in `en.ts` and `es.ts` for examples. Never hard-code plural logic.

**Number formatting:** `ProfileStory` uses `Intl.NumberFormat` with the resolved language. You don't need to do anything special for these.

**Checklist for a language PR:**
- All keys in `en.ts` are present in your translation.
- `npm run check` passes (types).
- `npm run build && npm run test:a11y` passes — longer strings may need CSS tweaks.
- Check that your language looks right on desktop and phone (set `lang: <your-lang>` in a test profile's YAML and use the editor preview).

## Commits and PRs

- Write small, focused PRs with a short description of *why*.
- For any visual change, include a screenshot or a short clip, desktop and phone if relevant.
- Commit messages should be in the imperative ("Add GitLab importer").

## Reporting bugs

Please include the profile YAML that renders wrong (fictional data is fine), the browser, and a screenshot.
