# Telegram Mini App Shop (Single-Vendor)

Шаблон интернет-магазина: **Telegram Mini App** (витрина) + **бот grammY** + REST API + PostgreSQL.
Реализован как единое приложение на **Next.js (App Router) + TypeScript + Drizzle ORM + Tailwind + Zustand**:
бот работает через webhook (`/api/telegram/webhook`), API — Route Handlers (`/api/*`).

## Быстрый старт (Docker)

```bash
cp .env.example .env      # заполните BOT_TOKEN, TELEGRAM_MINI_APP_URL, ADMIN_CHAT_ID …
docker compose up -d --build
docker compose logs -f
```

Локально: `npm i && npm run db:migrate && npm run dev`.

После запуска на HTTPS-домене один раз зарегистрируйте webhook и кнопку меню:

```bash
curl -X POST https://shop.example.com/api/telegram/setup -H "x-admin-key: $ADMIN_API_KEY"
```

Чтобы узнать `ADMIN_CHAT_ID`, добавьте бота в чат менеджеров и отправьте `/chatid`.

## Демо-режим
Локально, без `BOT_TOKEN`, магазин работает в браузере: авторизация — демо-пользователь,
админка `/admin` использует ключ `admin`, а демо-товары создаются автоматически
(`SEED_DEMO_DATA=false` отключает). Эти упрощённые настройки не используются в production:
демо-авторизация и демо-каталог там отключены, фиктивные реквизиты оплаты не подставляются.
Для отдельного публичного демо в production задайте `ENABLE_DEMO_MODE=true` только в его
изолированном окружении и подключите отдельную тестовую базу и тестового бота. Переменная
по умолчанию выключена; не включайте её в окружении магазина покупателя. Для публичного демо
задайте отдельный `ADMIN_API_KEY`, отключите Stars и используйте только тестовый платёжный
провайдер или фиктивные реквизиты без реального перевода.
Перед публикацией задайте собственный `ADMIN_API_KEY` (или `ADMIN_IDS`) и
`TELEGRAM_WEBHOOK_SECRET`; регистрация webhook без секрета отклоняется.
Промокоды создаются и управляются в `/admin` → «Промокоды».

## Структура
```
src/db/schema.ts                    users, categories, products, product_variants, promo_codes, orders, order_items
src/server/config.ts                чтение .env (валюта, оплата, доставка)
src/server/auth.ts                  проверка подписи Telegram initData (HMAC-SHA256)
src/server/services/                product / order / excel + payment/{IPaymentProvider, stars, card, manual}
src/server/bot/                     grammY: /start, /my_orders, /chatid, кнопки менеджеров, платежи, чеки
src/app/api/*                       REST: config, categories, products, orders, promo, admin/*, telegram/*
src/app/admin                       веб-админка: заказы, товары, промокоды, настройки, импорт/экспорт
src/components, src/views           интерфейс Mini App (MainButton/BackButton/Haptic через Telegram WebApp SDK)
src/store                           Zustand: корзина (persist) и каталог/фильтры
src/locales/{ru,en}.json            тексты интерфейса и бота
```

## Жизненный цикл заказа
Mini App → `POST /api/orders` (цены пересчитываются, остаток атомарно резервируется на сервере) →
карточка в чате менеджеров → оплата (Stars / карта / ручной перевод + чек в бот) →
«Подтвердить оплату» фиксирует списание →
«В сборку» → «Отправлен» → «Завершен» (или «Отклонить» — остаток возвращается). Покупатель получает уведомление на каждом шаге.
Резерв держится 15 минут для Stars/карты и 24 часа для ручного перевода; отмена или истечение срока освобождает его.
Когда остаток = 0, товар автоматически «Нет в наличии», кнопка покупки блокируется.

## Платежи
Новый провайдер: реализуйте `IPaymentProvider` и добавьте в `src/server/services/payment/index.ts`.
Stars включаются `TELEGRAM_STARS_ENABLED=true` (курс — `STARS_PER_UNIT`), банковская карта — `PAYMENT_PROVIDER_TOKEN` (BotFather → Payments).

## Импорт / экспорт
`/admin` → «Импорт / экспорт»: колонки `SKU, Name, Category, Price, Stock, Image, Description`; обновление по артикулу.
Фото можно выбрать с устройства в разделе «Товары» (`PNG`, `JPG`, `WebP`, до 10 МБ). На Vercel создайте Blob Store с доступом **Public** и подключите его к проекту и нужным окружениям через **Storage → Blob → Connect to Project**. Публичный доступ нужен, чтобы изображения показывались посетителям витрины. SDK использует автоматически выдаваемый Vercel OIDC-токен вместе с `BLOB_STORE_ID`; статический `BLOB_READ_WRITE_TOKEN` не требуется. Vercel не поддерживает сохранение загруженных файлов в `public` во время работы приложения.
Локально вне Vercel файлы сохраняются в `public/uploads`. В Docker они хранятся в отдельном volume `uploads` и переживают пересоздание контейнера.

## Настройки магазина
Раздел `/admin` → «Настройки магазина» позволяет изменить реквизиты ручной оплаты, адреса самовывоза и валюту. Значения сохраняются в таблице `store_settings` и переопределяют соответствующие значения `.env`.
Docker применяет только новые versioned migrations отдельным одноразовым сервисом перед запуском приложения. Локально и в Vercel используйте `npm run db:migrate`; для Vercel сначала получите переменные нужного окружения через `vercel env pull .env.local`.

Если база уже создавалась предыдущей версией через `drizzle-kit push` и у неё нет истории миграций, сначала сделайте резервную копию. Затем выполните `npm run db:baseline -- --confirm-existing-schema` только для схемы, созданной этим шаблоном, и после этого `npm run db:migrate`. Baseline проверит таблицы и колонки известных миграций; для неизвестной или частично изменённой схемы остановитесь и проверьте её вручную.
