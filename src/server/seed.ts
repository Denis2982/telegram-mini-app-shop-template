import { count } from "drizzle-orm";
import { db } from "@/db";
import { categories, productVariants, products } from "@/db/schema";
import { getConfig } from "./config";

const px = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

let seeding: Promise<void> | null = null;

/** Fills an empty database with demo catalog data (disable with SEED_DEMO_DATA=false). */
export function ensureSeeded(): Promise<void> {
  if (!getConfig().seedDemo) return Promise.resolve();
  if (!seeding) {
    seeding = run().catch((e) => {
      seeding = null;
      console.error("seed failed", e);
    });
  }
  return seeding;
}

async function run() {
  const [{ n: pc }] = await db.select({ n: count() }).from(products);
  const [{ n: cc }] = await db.select({ n: count() }).from(categories);
  if (pc > 0 || cc > 0) return;

  const [clothes, accessories, electronics] = await db
    .insert(categories)
    .values([
      { name: "Одежда", slug: "clothes", sortOrder: 1 },
      { name: "Аксессуары", slug: "accessories", sortOrder: 2 },
      { name: "Электроника", slug: "electronics", sortOrder: 3 },
    ])
    .returning();
  const [tshirts, hoodies, shoes] = await db
    .insert(categories)
    .values([
      { name: "Футболки", slug: "tshirts", parentId: clothes.id, sortOrder: 1 },
      { name: "Худи", slug: "hoodies", parentId: clothes.id, sortOrder: 2 },
      { name: "Обувь", slug: "shoes", parentId: clothes.id, sortOrder: 3 },
    ])
    .returning();

  const sizes = (price: number | null, stocks: number[]) =>
    ["S", "M", "L", "XL"].map((s, i) => ({ name: `Размер ${s}`, price: price !== null && s === "XL" ? price + 200 : price, stock: stocks[i] ?? 0 }));

  const items: {
    sku: string;
    name: string;
    description: string;
    categoryId: number;
    price: number;
    images: string[];
    specs: Record<string, string>;
    stock: number;
    variants?: { name: string; price: number | null; stock: number }[];
  }[] = [
    {
      sku: "TS-001",
      name: "Футболка Basic",
      description: "Классическая футболка из плотного хлопка. Свободный крой, не садится после стирки.",
      categoryId: tshirts.id,
      price: 1490,
      images: [px(7818329), px(5996939)],
      specs: { Материал: "100% хлопок", Плотность: "180 г/м²", Страна: "Португалия" },
      stock: 0,
      variants: sizes(null, [5, 12, 8, 0]),
    },
    {
      sku: "HD-001",
      name: "Худи Oversize",
      description: "Тёплое худи с капюшоном и карманом-кенгуру. Мягкий футер с начёсом.",
      categoryId: hoodies.id,
      price: 3990,
      images: [px(9695919), px(19461584)],
      specs: { Материал: "Хлопок 80%, полиэстер 20%", Крой: "Oversize", Уход: "Стирка 30°" },
      stock: 0,
      variants: sizes(3990, [3, 6, 4, 2]),
    },
    {
      sku: "SN-001",
      name: "Кеды Canvas",
      description: "Лёгкие кеды из плотного текстиля на резиновой подошве. Универсальны на каждый день.",
      categoryId: shoes.id,
      price: 4590,
      images: [px(4296075), px(19845610)],
      specs: { Верх: "Текстиль", Подошва: "Резина" },
      stock: 0,
      variants: [40, 41, 42, 43].map((s, i) => ({ name: `EU ${s}`, price: null, stock: [2, 5, 0, 3][i] })),
    },
    {
      sku: "BP-001",
      name: "Рюкзак Urban 20L",
      description: "Водостойкий городской рюкзак с отделением для ноутбука 15\" и скрытым карманом.",
      categoryId: accessories.id,
      price: 3290,
      images: [px(20094394), px(33861296)],
      specs: { Объём: "20 л", Материал: "Нейлон", Вес: "650 г" },
      stock: 14,
    },
    {
      sku: "WT-001",
      name: "Часы Classic Leather",
      description: "Аналоговые часы с кожаным ремешком и сапфировым стеклом. Водозащита 5 ATM.",
      categoryId: accessories.id,
      price: 8900,
      images: [px(6157408), px(1136589)],
      specs: { Механизм: "Кварц", Корпус: "Сталь 40 мм", Водозащита: "5 ATM" },
      stock: 6,
    },
    {
      sku: "HP-001",
      name: "Наушники AirSound",
      description: "Беспроводные наушники с шумоподавлением и автономностью до 30 часов.",
      categoryId: electronics.id,
      price: 6990,
      images: [px(3394650), px(3394648)],
      specs: { Bluetooth: "5.3", Батарея: "30 ч", Зарядка: "USB-C" },
      stock: 9,
    },
    {
      sku: "HP-002",
      name: "Наушники AirSound Mini",
      description: "Компактная версия AirSound — распродано, ждите поступления.",
      categoryId: electronics.id,
      price: 4990,
      images: [px(3394648)],
      specs: { Bluetooth: "5.2", Батарея: "18 ч" },
      stock: 0,
    },
  ];

  for (const it of items) {
    const { variants, ...p } = it;
    const [row] = await db.insert(products).values(p).returning();
    if (variants?.length) {
      await db.insert(productVariants).values(variants.map((v) => ({ ...v, productId: row.id })));
    }
  }
}
