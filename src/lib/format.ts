const numberLocales: Record<string, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

export function formatAmount(amount: number, currencySymbol: string, locale: string) {
  const formatted = new Intl.NumberFormat(numberLocales[locale] ?? locale, {
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currencySymbol}`;
}
