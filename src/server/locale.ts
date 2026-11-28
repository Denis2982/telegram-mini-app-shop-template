import ru from "@/locales/ru.json";
import en from "@/locales/en.json";
import uk from "@/locales/uk.json";
import { translate, type Dict } from "@/lib/i18n";
import { getConfig, type Locale } from "./config";

const dicts: Record<Locale, Dict> = { ru, en, uk };

export function getDict(locale: Locale): Dict {
  return dicts[locale];
}

export function trDefault(key: string, vars?: Record<string, string | number>) {
  return translate(dicts[getConfig().defaultLocale], key, vars);
}
