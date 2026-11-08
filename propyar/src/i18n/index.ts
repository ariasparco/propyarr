import type { Locale } from './config';
import type { Dictionary } from './dictionaries/en';
import en from './dictionaries/en';
import fa from './dictionaries/fa';

const dictionaries: Record<Locale, Dictionary> = { en, fa };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? fa;
}

export type { Dictionary };
