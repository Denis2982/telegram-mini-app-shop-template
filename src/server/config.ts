import { formatAmount } from "@/lib/format";

/**
 * Reads and normalises all application settings from environment variables (.env).
 * Evaluated lazily through a getter so values are always fresh at runtime.
 */
const env = (key: string, fallback = "") => {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
};
const flag = (key: string, fallback: boolean) => {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
};
const num = (key: string, fallback: number) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && process.env[key] !== "" && process.env[key] !== undefined ? n : fallback;
};
const list = (key: string, fallback: string[] = []) => {
  const v = process.env[key];
  if (!v) return fallback;
  return v
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export const SUPPORTED_LOCALES = ["ru", "en", "uk"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function getConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  const enableDemoMode = flag("ENABLE_DEMO_MODE", false);
  const botToken = env("BOT_TOKEN");
  return {
    botToken,
    miniAppUrl: env("TELEGRAM_MINI_APP_URL").replace(/\/$/, ""),
    botUsername: env("BOT_USERNAME").replace(/^@/, ""),
    supportUsername: env("SUPPORT_USERNAME").replace(/^@/, ""),
    webhookSecret: env("TELEGRAM_WEBHOOK_SECRET", isProduction ? "" : "tma-shop-secret"),
    adminChatId: env("ADMIN_CHAT_ID"),
    adminIds: env("ADMIN_IDS")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    /** Key for the web admin panel (/admin). In local demo mode it defaults to "admin". */
    adminApiKey: env("ADMIN_API_KEY", isProduction || botToken ? "" : "admin"),
    allowDevAuth: isProduction ? enableDemoMode && flag("ALLOW_DEV_AUTH", true) : flag("ALLOW_DEV_AUTH", !botToken),
    seedDemo: isProduction
      ? enableDemoMode && flag("SEED_DEMO_DATA", true)
      : flag("SEED_DEMO_DATA", true),

    storeName: env("STORE_NAME", "Commercial Shop"),
    currencyCode: env("CURRENCY_CODE", "RUB"),
    currencySymbol: env("CURRENCY_SYMBOL", "₽"),
    defaultLocale: (SUPPORTED_LOCALES as readonly string[]).includes(env("DEFAULT_LOCALE", "ru"))
      ? (env("DEFAULT_LOCALE", "ru") as Locale)
      : ("ru" as Locale),

    paymentProviderToken: env("PAYMENT_PROVIDER_TOKEN"),
    starsEnabled: flag("TELEGRAM_STARS_ENABLED", false),
    /** How many Stars cost one unit of the store currency. */
    starsPerUnit: num("STARS_PER_UNIT", 0.5),
    manualDetails: env(
      "MANUAL_PAYMENT_DETAILS",
      isProduction ? "" : "Сбербанк: 0000 0000 0000 0000\nПолучатель: Иван И.\nВ комментарии укажите номер заказа",
    ),

    courierFee: num("DELIVERY_COURIER_FEE", 300),
    postFee: num("DELIVERY_POST_FEE", 200),
    freeDeliveryFrom: num("FREE_DELIVERY_FROM", 5000),
    pickupPoints: list("PICKUP_POINTS", ["ул. Тверская, 1 (10:00–21:00)", "ТЦ «Галерея», 2 этаж (10:00–22:00)"]),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;

export function pickLocale(code?: string | null): Locale {
  const c = (code ?? "").slice(0, 2).toLowerCase();
  if ((SUPPORTED_LOCALES as readonly string[]).includes(c)) return c as Locale;
  return getConfig().defaultLocale;
}

export function formatMoney(
  n: number,
  cfg: Pick<AppConfig, "currencySymbol"> = getConfig(),
  locale: string = getConfig().defaultLocale,
) {
  return formatAmount(n, cfg.currencySymbol, pickLocale(locale));
}

export function deliveryFeeFor(method: string, subtotalAfterDiscount: number, cfg: AppConfig = getConfig()) {
  if (method === "pickup") return 0;
  if (cfg.freeDeliveryFrom > 0 && subtotalAfterDiscount >= cfg.freeDeliveryFrom) return 0;
  return method === "post" ? cfg.postFee : cfg.courierFee;
}

export function availablePaymentMethods(cfg: AppConfig = getConfig()) {
  const methods: string[] = [];
  if (cfg.botToken && cfg.starsEnabled) methods.push("stars");
  if (cfg.botToken && cfg.paymentProviderToken) methods.push("card");
  if (cfg.manualDetails) methods.push("manual");
  return methods;
}
