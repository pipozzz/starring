// `starring discover`: the editor's "Find updates", run on your machine with your own GitHub
// token (GITHUB_TOKEN, or the gh CLI's). Imports what GitHub knows about you, compares it with
// your Starring YAML and lists what the stage doesn't say yet. With --out it writes a copy of the
// YAML with every suggestion added, to review and import in the editor. Nothing is uploaded:
// the only requests go to api.github.com.
//
// Bundled into cli/discover.mjs (npm run build:cli) so the published CLI keeps zero dependencies.
import { parse, stringify } from 'yaml';
import { applyChange, discover, type Suggestion } from '../lib/discover';
import { importGithub, usernameFrom } from '../lib/importers/github';
import type { Profile } from '../lib/model';

export { GithubImportError } from '../lib/importers/github';

export interface Updates {
  login: string;
  suggestions: Suggestion[];
  /** The draft with every suggestion added. */
  updated: Profile;
}

/** A Starring profile from YAML or JSON text (what the editor's Copy YAML gives you). */
export const readProfile = (text: string): Profile => {
  const p = parse(text) as Profile | null;
  if (!p || typeof p !== 'object' || !p.profile) throw new Error('That file isn’t a Starring profile (no `profile:` section)');
  return p;
};

export const writeProfile = (p: Profile) =>
  `# Starring profile — import it in the editor (Start from → Import), or drop into profiles/${p.handle}.yaml\n` + stringify(p, { lineWidth: 0 });

export async function findUpdates(
  { login, draft, token }: { login?: string; draft?: Profile; token?: string },
  importer: typeof importGithub = importGithub,
): Promise<Updates> {
  const who = login?.trim() ? usernameFrom(login) : draft?.profile.links?.github ? usernameFrom(draft.profile.links.github) : '';
  if (!who) throw new Error('Which GitHub account? Pass a login, or a profile with a GitHub link');
  const { profile: found } = await importer(who, { token, deep: !!token });
  const base: Profile = draft ?? { ...found, projects: [], openSource: [], contributions: [] };
  const suggestions = discover(base, found);
  return { login: who, suggestions, updated: suggestions.reduce((p, s) => applyChange(p, s.change), base) };
}
