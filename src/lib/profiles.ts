import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { HANDLE, RESERVED, type Profile } from './model';
import { THEMES, hasTheme } from '../themes';

export * from './model';

export type StoreMode = 'demo' | 'personal' | 'directory';

/**
 * Where profiles come from.
 * - static mode: YAML files in profiles/ (falling back to examples/)
 * - server mode: those YAML files + published profiles from Postgres
 */
export interface ProfileStore {
  /** demo = showing examples/; personal = exactly one profile, shown as the home page */
  mode(): Promise<StoreMode>;
  list(): Promise<Profile[]>;
  /** When each stage joined (handle → ISO date); empty where files don't say. */
  joined(): Promise<Record<string, string>>;
  get(handle: string): Promise<Profile | undefined>;
}

const readDir = (dir: string): Profile[] =>
  !fs.existsSync(dir)
    ? []
    : fs
        .readdirSync(dir)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((f) => {
          const p = parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Profile;
          if (!p?.handle || !HANDLE.test(p.handle)) throw new Error(`${dir}/${f}: invalid or missing handle`);
          if (RESERVED.includes(p.handle)) throw new Error(`${dir}/${f}: handle "${p.handle}" is reserved`);
          if (!p.profile?.name) throw new Error(`${dir}/${f}: profile.name is required`);
          if (!hasTheme(p.theme)) throw new Error(`${dir}/${f}: unknown theme "${p.theme}" — available: ${THEMES.map((t) => t.id).join(', ')}`);
          return p;
        })
        .sort((a, b) => a.handle.localeCompare(b.handle));

const PROFILES_DIR = path.resolve('profiles');
const EXAMPLES_DIR = path.resolve('examples');

// Files are re-read on every call so `astro dev` picks up new YAML without a restart.
export const yamlStore = (dir = PROFILES_DIR, examples = EXAMPLES_DIR): ProfileStore => {
  const load = () => {
    const own = readDir(dir);
    return own.length ? own : readDir(examples);
  };
  return {
    mode: async () => {
      const n = readDir(dir).length;
      return n === 0 ? 'demo' : n === 1 ? 'personal' : 'directory';
    },
    list: async () => load(),
    joined: async () => ({}),
    get: async (handle) => load().find((p) => p.handle === handle),
  };
};

/** Handles taken by files — DB users can't claim these. */
export const fileHandles = () => [...readDir(PROFILES_DIR), ...readDir(EXAMPLES_DIR)].map((p) => p.handle);

const hybridStore = (): ProfileStore => {
  const db = () => import('../server/profiles');
  const files = () => readDir(PROFILES_DIR);
  const all = async () => {
    const published = await (await db()).listPublished();
    const merged = [...files(), ...published];
    // a fresh instance still shows something: the examples, until real profiles exist
    return (merged.length ? merged : readDir(EXAMPLES_DIR)).sort((a, b) => a.handle.localeCompare(b.handle));
  };
  return {
    mode: async () => (files().length || (await (await db()).listPublished()).length ? 'directory' : 'demo'),
    list: all,
    joined: async () => (await db()).joinedDates(),
    get: async (handle) => files().find((p) => p.handle === handle) ?? (await (await db()).getPublished(handle)) ?? readDir(EXAMPLES_DIR).find((p) => p.handle === handle),
  };
};

export const SERVER_MODE = import.meta.env.STARRING_MODE === 'server';

export const store: ProfileStore = SERVER_MODE ? hybridStore() : yamlStore();
