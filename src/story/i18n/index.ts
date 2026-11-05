import type { Lang } from '../../lib/model';
import en, { type I18nStrings } from './en';
import es from './es';

const dictionaries: Record<Lang, I18nStrings> = { en, es };

export type { I18nStrings };

export const getStrings = (lang: Lang): I18nStrings => dictionaries[lang] ?? en;

export const formatNumber = (n: number, lang: Lang): string =>
  new Intl.NumberFormat(lang).format(n);
