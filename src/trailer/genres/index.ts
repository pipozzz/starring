// Trailer genres. A genre is a set of scene renderers plus a palette and a rhythm; add one
// here and it shows up in the player's picker.
import type { Genre } from '../engine';
import blockbuster from './blockbuster';
import noir from './noir';

export const GENRES: Genre[] = [blockbuster, noir];
export const DEFAULT_GENRE = 'blockbuster';
export const getGenre = (id?: string | null) => GENRES.find((g) => g.id === id) ?? GENRES[0];
