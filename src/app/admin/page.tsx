"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWebApp } from "@/hooks/useTelegram";
import type { OrderDto, ProductDto, PromoCodeDto, PromoDiscountType, StoreSettingsDto } from "@/types";
import Link from 'next/link'

type Tab = "orders" | "products" | "io" | "promos" | "settings";

const STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  paid: "Оплачен",
  processing: "В сборке",
  shipped: "Отправлен",
  completed: "Завершён",
  cancelled: "Отклонён",
};

export default function AdminPage() {
  const [key, setKey] = useState("")
  const restoreAttempted = useRef(false);
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [msg, setMsg] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [settingsForm, setSettingsForm] = useState({
    manualDetails: "",
    pickupPoints: "",
    currencyCode: "RUB",
    currencySymbol: "₽",
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [promos, setPromos] = useState<PromoCodeDto[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [editingPromoCode, setEditingPromoCode] = useState<string | null>(null);
  const [promoForm, setPromoForm] = useState({
    code: "",
    discountType: "percent" as PromoDiscountType,
    value: "",
    active: true,
  });

  const call = useCallback(
    async (path: string, init: RequestInit = {}, k = key) => {
      const headers = new Headers(init.headers);
      headers.set("x-admin-key", k);
      const initData = getWebApp()?.initData;
      if (initData) headers.set("Authorization", `tma ${initData}`);
      if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
      return fetch(path, { ...init, headers, cache: "no-store" });
    },
    [key],
  );

  const load = useCallback(
    async (k = key) => {
      const [o, p] = await Promise.all([call("/api/admin/orders", {}, k), call("/api/admin/products", {}, k)]);
      if (!o.ok || !p.ok) return false;
      setOrders(await o.json());
      setProducts(await p.json());
      return true;
    },
    [call, key],
  );

  const loadSettings = useCallback(
    async (k = key) => {
      setSettingsLoading(true);
      try {
        const response = await call("/api/admin/settings", {}, k);
        const data = await response.json();
        if (!response.ok) {
          setMsg(`Ошибка: ${data.error}`);
          return false;
        }
        const settings = data as StoreSettingsDto;
        setSettingsForm({
          manualDetails: settings.manualDetails,
          pickupPoints: settings.pickupPoints.join("\n"),
          currencyCode: settings.currencyCode,
          currencySymbol: settings.currencySymbol,
        });
        setMsg("");
        return true;
      } catch (error) {
        console.error("Could not load store settings", error);
        setMsg("Не удалось загрузить настройки магазина");
        return false;
      } finally {
        setSettingsLoading(false);
      }
    },
    [call, key],
  );

  const loadPromos = useCallback(
    async (k = key) => {
      setPromosLoading(true);
      try {
        const response = await call("/api/admin/promos", {}, k);
        const data = await response.json();
        if (!response.ok) {
          setMsg(`Ошибка: ${data.error}`);
          return false;
        }
        setPromos(data as PromoCodeDto[]);
        return true;
      } catch (error) {
        console.error("Could not load promo codes", error);
        setMsg("Не удалось загрузить промокоды");
        return false;
      } finally {
        setPromosLoading(false);
      }
    },
    [call, key],
  );

  useEffect(() => {
    if (restoreAttempted.current) return
    restoreAttempted.current = true

    const saved = sessionStorage.getItem("admin-key") ?? ""
    if (!saved) return

    void Promise.all([
      call("/api/admin/orders", {}, saved),
      call("/api/admin/products", {}, saved),
    ]).then(async ([o, p]) => {
      setKey(saved)

      if (!o.ok || !p.ok) return

      const [loadedOrders, loadedProducts] = await Promise.all([
        o.json(),
        p.json(),
      ])

      setOrders(loadedOrders)
      setProducts(loadedProducts)
      setAuthed(true)
    })
  }, [call])

  useEffect(() => {
    if (!authed || !key) return

    const interval = setInterval(() => {
      void load(key)
    }, 5000)

    return () => clearInterval(interval)
  }, [authed, key, load]);

  const login = async () => {
    const ok = await load(key);
    setAuthed(ok);
    setMsg(ok ? "" : "Неверный ключ");
    if (ok) sessionStorage.setItem("admin-key", key);
  };

  const act = async (id: number, action: string) => {
    const r = await call(`/api/admin/orders/${id}`, { method: "POST", body: JSON.stringify({ action }) });
    if (!r.ok) setMsg(`Ошибка: ${(await r.json()).error}`);
    else setMsg("");
    await load();
  };

  const patch = async (id: number, body: object, context?: string) => {
    const r = await call(`/api/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (!r.ok) {
      const error = await r.json().catch(() => ({ error: "Internal error" }));
      setMsg(context ? `${context}: ${error.error}` : `Ошибка: ${error.error}`);
      return false;
    }
    setMsg("");
    await load();
    return true;
  };

  const saveStoreSettings = async () => {
    setSettingsSaving(true);
    try {
      const response = await call("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          manualDetails: settingsForm.manualDetails,
          pickupPoints: settingsForm.pickupPoints.split(/\r?\n/).map((point) => point.trim()).filter(Boolean),
          currencyCode: settingsForm.currencyCode,
          currencySymbol: settingsForm.currencySymbol,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMsg(`Ошибка: ${data.error}`);
        return;
      }
      const saved = data as StoreSettingsDto;
      setSettingsForm({
        manualDetails: saved.manualDetails,
        pickupPoints: saved.pickupPoints.join("\n"),
        currencyCode: saved.currencyCode,
        currencySymbol: saved.currencySymbol,
      });
      setMsg("Настройки магазина сохранены");
    } catch (error) {
      console.error("Could not save store settings", error);
      setMsg("Не удалось сохранить настройки магазина");
    } finally {
      setSettingsSaving(false);
    }
  };

  const savePromo = async () => {
    const body = {
      ...promoForm,
      code: promoForm.code.trim().toUpperCase(),
      value: Number(promoForm.value),
    };
    const path = editingPromoCode
      ? `/api/admin/promos/${encodeURIComponent(editingPromoCode)}`
      : "/api/admin/promos";
    try {
      const response = await call(path, {
        method: editingPromoCode ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setMsg(`Ошибка: ${data.error}`);
        return;
      }
      setEditingPromoCode(null);
      setPromoForm({ code: "", discountType: "percent", value: "", active: true });
      if (await loadPromos()) setMsg(editingPromoCode ? "Промокод обновлён" : "Промокод создан");
    } catch (error) {
      console.error("Could not save promo code", error);
      setMsg("Не удалось сохранить промокод");
    }
  };

  const changePromoStatus = async (promo: PromoCodeDto) => {
    try {
      const response = await call(`/api/admin/promos/${encodeURIComponent(promo.code)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...promo, active: !promo.active }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMsg(`Ошибка: ${data.error}`);
        return;
      }
      if (await loadPromos()) setMsg(promo.active ? "Промокод отключён" : "Промокод включён");
    } catch (error) {
      console.error("Could not change promo status", error);
      setMsg("Не удалось изменить статус промокода");
    }
  };

  const removePromo = async (code: string) => {
    if (!window.confirm(`Удалить промокод ${code}?`)) return;
    try {
      const response = await call(`/api/admin/promos/${encodeURIComponent(code)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setMsg(`Ошибка: ${data.error}`);
        return;
      }
      if (await loadPromos()) setMsg("Промокод удалён");
      if (editingPromoCode === code) {
        setEditingPromoCode(null);
        setPromoForm({ code: "", discountType: "percent", value: "", active: true });
      }
    } catch (error) {
      console.error("Could not delete promo code", error);
      setMsg("Не удалось удалить промокод");
    }
  };

  const uploadProductImage = async (product: ProductDto, file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await call("/api/admin/upload", { method: "POST", body: formData });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Не удалось загрузить фото" }));
        setMsg(`Не удалось загрузить фото: ${error.error ?? "Неизвестная ошибка"}`);
        return null;
      }
      const { url } = (await response.json()) as { url: string };
      const images = [url, ...product.images.slice(1)];
      return (await patch(product.id, { images }, "Фото загружено, но не удалось сохранить его у товара")) ? url : null;
    } catch (error) {
      console.error("Product image upload failed", error);
      setMsg("Ошибка: не удалось загрузить фото");
      return null;
    }
  };

  const download = async (format: "xlsx" | "csv") => {
    const r = await call(`/api/admin/products/export?format=${format}`);
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `products.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadOrders = async () => {
    const r = await call("/api/admin/orders/export");
    if (!r.ok) {
      setMsg("Не удалось экспортировать заказы");
      return;
    }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const report = async (r: Response) => {
    const d = await r.json();
    if (!r.ok) return setMsg(`Ошибка: ${d.error}`);
    setMsg(`Создано: ${d.created}, обновлено: ${d.updated}, ошибок: ${d.errors.length}${d.errors.length ? " — " + d.errors.slice(0, 3).map((e: { row: number; message: string }) => `стр.${e.row}: ${e.message}`).join("; ") : ""}`);
    await load();
  };

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    await report(await call("/api/admin/products/import", { method: "POST", body: fd }));
  };

  if (!authed) {
    return (
      <main className="mx-auto grid min-h-screen max-w-sm place-items-center p-6">
        <div className="w-full space-y-3 rounded-2xl bg-white p-6 shadow">
          <h1 className="text-xl font-bold">Админ-панель</h1>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="ADMIN_API_KEY" className="w-full rounded-xl bg-slate-100 px-4 py-3 outline-none" />
          <button onClick={login} className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white">Войти</button>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <p className="text-xs text-slate-500">В демо-режиме (без BOT_TOKEN) ключ по умолчанию: <code>admin</code></p>
        </div>
      </main>
    );
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => {
        setTab(t);
        if (t === "settings") void loadSettings();
        if (t === "promos") void loadPromos();
      }}
      className={`cursor-pointer rounded-full px-4 py-2 text-sm ${tab === t ? "bg-blue-600 font-semibold text-white" : "bg-white"}`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 text-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-3 text-xl font-bold">Админ-панель</h1>
        {tabBtn("orders", `Заказы (${orders.length})`)}
        {tabBtn("products", `Товары (${products.length})`)}
        {tabBtn("io", "Импорт / экспорт")}
        {tabBtn("promos", `Промокоды (${promos.length})`)}
        {tabBtn("settings", "Настройки магазина")}
        <Link href="/" className="ml-auto cursor-pointer text-sm text-blue-600">
          ← Витрина
        </Link>
      </div>
      {msg && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{msg}</p>}

      {tab === "orders" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Btn onClick={downloadOrders}>📥 Экспорт в Excel</Btn>
          </div>
          {orders.length === 0 && <p className="text-slate-500">Заказов пока нет</p>}
          {orders.map((o) => (
            <div key={o.id} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>Заказ №{o.id}</b>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{STATUS_LABEL[o.status]} · {o.paymentStatus === "paid" ? "оплачен" : "не оплачен"} · {o.paymentMethod}</span>
              </div>
              <p className="text-sm text-slate-600">{o.customerName}, {o.customerPhone} — {o.deliveryMethod}: {o.address}</p>
              <p className="text-sm">{o.items.map((i) => `${i.name}${i.variantName ? ` (${i.variantName})` : ""} × ${i.quantity}`).join("; ")}</p>
              <p className="font-semibold">Итого: {o.total} {o.currency}</p>
              <div className="flex flex-wrap gap-2">
                {o.paymentStatus !== "paid" && o.status !== "cancelled" && <Btn onClick={() => act(o.id, "pay")}>💳 Подтвердить оплату</Btn>}
                {o.status === "paid" && <Btn onClick={() => act(o.id, "processing")}>📦 В сборку</Btn>}
                {["paid", "processing"].includes(o.status) && <Btn onClick={() => act(o.id, "shipped")}>🚚 Отправлен</Btn>}
                {["paid", "processing", "shipped"].includes(o.status) && <Btn onClick={() => act(o.id, "completed")}>✅ Завершен</Btn>}
                {!["completed", "cancelled"].includes(o.status) && <Btn danger onClick={() => act(o.id, "cancel")}>❌ Отклонить</Btn>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "products" && (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="p-3">Артикул</th><th className="p-3">Фото</th><th className="p-3">Название</th><th className="p-3">Категория</th><th className="p-3">Цена</th><th className="p-3">Остаток</th><th className="p-3">Активен</th></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="p-3 font-mono text-xs">{p.sku}</td>
                  <td className="min-w-64 p-3">
                    <ProductImageEditor
                      product={p}
                      onSaveUrl={(url) => patch(p.id, { images: url ? [url, ...p.images.slice(1)] : p.images.slice(1) })}
                      onUpload={(file) => uploadProductImage(p, file)}
                    />
                  </td>
                  <td className="p-3">{p.name}</td>
                  <td className="p-3">{p.categoryName ?? "—"}</td>
                  <td className="p-3"><NumInput key={`price-${p.id}-${p.price}`} value={p.price} onSave={(v) => patch(p.id, { price: v })} /></td>
                  <td className="p-3">
                    {p.variants.length ? <span title={p.variants.map((v) => `${v.name}: ${v.stock}`).join(", ")}>{p.stock} (вариации)</span> : <NumInput key={`stock-${p.id}-${p.stock}`} value={p.stock} onSave={(v) => patch(p.id, { stock: v })} />}
                    {!p.inStock && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">нет</span>}
                  </td>
                  <td className="p-3"><input type="checkbox" className="cursor-pointer" defaultChecked={p.active} onChange={(e) => patch(p.id, { active: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "io" && (
        <div className="space-y-4">
          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Экспорт номенклатуры</h2>
            <div className="flex gap-2"><Btn onClick={() => download("xlsx")}>⬇ XLSX</Btn><Btn onClick={() => download("csv")}>⬇ CSV</Btn></div>
          </section>
          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Импорт из файла (XLSX / CSV)</h2>
            <p className="text-sm text-slate-500">Колонки: SKU, Name, Category, Price, Stock, Image, Description (или Артикул, Название, Категория, Цена, Остаток, Ссылка на фото). Строки обновляются по артикулу.</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-xl bg-blue-50 px-3.5 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500">
                📁 Выберите файл
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    setImportFileName(file.name);
                    void upload(file);
                  }}
                />
              </label>
              {importFileName && <span className="text-sm text-slate-600">{importFileName}</span>}
            </div>
          </section>
          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Импорт из Google Таблицы</h2>
            <p className="text-sm text-slate-500">Таблица должна быть доступна по ссылке (чтение).</p>
            <div className="flex gap-2">
              <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm outline-none" />
              <Btn onClick={async () => sheetUrl && report(await call("/api/admin/products/import", { method: "POST", body: JSON.stringify({ url: sheetUrl }) }))}>Импорт</Btn>
            </div>
          </section>
        </div>
      )}

      {tab === "settings" && (
        <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-semibold">Настройки магазина</h2>
            <p className="mt-1 text-sm text-slate-500">Значения сохраняются в базе данных и заменяют настройки из .env.</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Реквизиты для ручной оплаты</span>
            <textarea
              value={settingsForm.manualDetails}
              onChange={(event) => setSettingsForm({ ...settingsForm, manualDetails: event.target.value })}
              rows={5}
              maxLength={5000}
              placeholder="Название банка, номер карты или счёта, получатель"
              className="w-full resize-y rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Адрес самовывоза</span>
            <span className="block text-xs text-slate-500">Каждый пункт самовывоза укажите с новой строки.</span>
            <textarea
              value={settingsForm.pickupPoints}
              onChange={(event) => setSettingsForm({ ...settingsForm, pickupPoints: event.target.value })}
              rows={4}
              placeholder="Адрес и часы работы"
              className="w-full resize-y rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">Код валюты</span>
              <input
                value={settingsForm.currencyCode}
                onChange={(event) => setSettingsForm({ ...settingsForm, currencyCode: event.target.value.toUpperCase() })}
                maxLength={3}
                placeholder="RUB"
                className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">Обозначение валюты</span>
              <input
                value={settingsForm.currencySymbol}
                onChange={(event) => setSettingsForm({ ...settingsForm, currencySymbol: event.target.value })}
                maxLength={8}
                placeholder="₽"
                className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
          </div>
          <Btn onClick={saveStoreSettings} disabled={settingsLoading || settingsSaving}>
            {settingsLoading ? "Загрузка…" : settingsSaving ? "Сохранение…" : "Сохранить настройки"}
          </Btn>
        </section>
      )}
      {tab === "promos" && (
        <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-semibold">Управление промокодами</h2>
            <p className="mt-1 text-sm text-slate-500">Промокоды проверяются при оформлении заказа и применяются только если активны.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">Код</span>
              <input
                value={promoForm.code}
                onChange={(event) => setPromoForm({ ...promoForm, code: event.target.value.toUpperCase() })}
                maxLength={32}
                placeholder="SUMMER10"
                className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm uppercase outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">Тип скидки</span>
              <select
                value={promoForm.discountType}
                onChange={(event) => setPromoForm({ ...promoForm, discountType: event.target.value as PromoDiscountType })}
                className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="percent">Процент</option>
                <option value="fixed">Фиксированная сумма</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">Размер скидки</span>
              <input
                type="number"
                min="0.01"
                max={promoForm.discountType === "percent" ? 100 : undefined}
                step={promoForm.discountType === "percent" ? 1 : 0.01}
                value={promoForm.value}
                onChange={(event) => setPromoForm({ ...promoForm, value: event.target.value })}
                placeholder={promoForm.discountType === "percent" ? "10" : "500"}
                className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 self-end rounded-xl bg-slate-100 px-4 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={promoForm.active}
                onChange={(event) => setPromoForm({ ...promoForm, active: event.target.checked })}
                className="cursor-pointer"
              />
              Активен
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={savePromo}>{editingPromoCode ? "Сохранить изменения" : "Добавить промокод"}</Btn>
            {editingPromoCode && (
              <Btn onClick={() => {
                setEditingPromoCode(null);
                setPromoForm({ code: "", discountType: "percent", value: "", active: true });
              }}>
                Отмена
              </Btn>
            )}
          </div>
          {promosLoading ? (
            <p className="text-sm text-slate-500">Загрузка промокодов…</p>
          ) : promos.length === 0 ? (
            <p className="text-sm text-slate-500">Промокодов пока нет</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="p-3">Код</th>
                    <th className="p-3">Скидка</th>
                    <th className="p-3">Использовано</th>
                    <th className="p-3">Статус</th>
                    <th className="p-3">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((promo) => (
                    <tr key={promo.code} className="border-t border-slate-100">
                      <td className="p-3 font-mono font-semibold">{promo.code}</td>
                      <td className="p-3">{promo.value}{promo.discountType === "percent" ? "%" : " (фикс.)"}</td>
                      <td className="p-3">{promo.used}{promo.usageLimit !== null ? ` / ${promo.usageLimit}` : ""}</td>
                      <td className="p-3">{promo.active ? "Активен" : "Отключён"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Btn onClick={() => {
                            setEditingPromoCode(promo.code);
                            setPromoForm({
                              code: promo.code,
                              discountType: promo.discountType,
                              value: String(promo.value),
                              active: promo.active,
                            });
                          }}>
                            Изменить
                          </Btn>
                          <Btn onClick={() => changePromoStatus(promo)}>{promo.active ? "Отключить" : "Включить"}</Btn>
                          <Btn danger onClick={() => removePromo(promo.code)}>Удалить</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function ProductImageEditor({
  product,
  onSaveUrl,
  onUpload,
}: {
  product: ProductDto;
  onSaveUrl: (url: string) => Promise<boolean>;
  onUpload: (file: File) => Promise<string | null>;
}) {
  const currentImage = product.images[0] ?? "";
  const [draftImage, setDraftImage] = useState({ base: currentImage, value: currentImage });
  const [failedUrl, setFailedUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageUrl = draftImage.base === currentImage ? draftImage.value : currentImage;
  const previewFailed = imageUrl !== "" && failedUrl === imageUrl;

  const selectFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    const url = await onUpload(file);
    if (url) {
      setDraftImage({ base: currentImage, value: url });
      setFailedUrl("");
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="flex min-w-56 items-center gap-2">
      {imageUrl && !previewFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`Фото товара ${product.name}`}
          onError={() => setFailedUrl(imageUrl)}
          className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover"
        />
      ) : (
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl" aria-label="Фото отсутствует">
          📷
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <input
          type="url"
          value={imageUrl}
          onChange={(event) => {
            setDraftImage({ base: currentImage, value: event.target.value });
            setFailedUrl("");
          }}
          onBlur={() => {
            const nextUrl = imageUrl.trim();
            if (nextUrl !== (product.images[0] ?? "")) void onSaveUrl(nextUrl);
          }}
          placeholder="URL фото"
          aria-label={`URL фото товара ${product.name}`}
          className="w-full rounded-lg bg-slate-100 px-2 py-1 text-xs outline-none"
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className="cursor-pointer text-left text-xs font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Загрузка…" : imageUrl && !previewFailed ? "📷 Заменить фото" : "📷 Добавить фото"}
        </button>
      </div>
    </div>
  );
}

function Btn({ children, onClick, danger, disabled }: { children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${disabled ? "" : "cursor-pointer"} ${danger ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
      {children}
    </button>
  );
}

function NumInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));  
  return (
    <input
      value={v}
      inputMode="decimal"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => Number(v) !== value && Number.isFinite(Number(v)) && onSave(Number(v))}
      className="w-24 rounded-lg bg-slate-100 px-2 py-1 outline-none"
    />
  );
}
