"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { PageHeader } from "@/components/Header";
import { getWebApp, haptic } from "@/hooks/useTelegram";
import { useShopStore, useT } from "@/store/useShopStore";
import type { OrderDto, PaymentInstruction } from "@/types";

const STEPS = ["new", "paid", "processing", "shipped", "completed"] as const;

export function OrderStatus({
  id,
  initialPayment,
  onBack,
  onCatalog,
}: {
  id: number;
  initialPayment?: PaymentInstruction;
  onBack: () => void;
  onCatalog: () => void;
}) {
  const { t, money } = useT();
  const botUsername = useShopStore((s) => s.config?.botUsername);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [payment, setPayment] = useState<PaymentInstruction | undefined>(initialPayment);
  const [notice, setNotice] = useState("");
  const autoOpened = useRef(false);

  const load = useCallback(() => api.order(id), [id])

  useEffect(() => {
    let active = true

    const refresh = () => {
      void load()
        .then((nextOrder) => {
          if (active) setOrder(nextOrder)
        })
        .catch(() => {
          // При временной ошибке оставляем последний загруженный заказ.
        })
    }

    refresh()
    const timer = setInterval(refresh, 4000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [load]);

  const openInvoice = useCallback(
    (url: string) => {
      const wa = getWebApp();
      if (!wa?.initData) return setNotice(t("order.invoiceOnlyTelegram"));
      wa.openInvoice(url, (status) => {
        if (status === "paid") haptic.success();
        void load()
          .then(setOrder)
          .catch(() => {
            // Оставляем последний загруженный заказ.
          });
      });
    },
    [load, t],
  );

  // Open the Stars / card invoice right after the order is created.
  useEffect(() => {
    if (payment?.type === "invoice" && !autoOpened.current) {
      autoOpened.current = true
      openInvoice(payment.url)
    }
  }, [payment, openInvoice]);

  const pay = async () => {
    setNotice("");
    try {
      const p = await api.payOrder(id);
      setPayment(p);
      if (p.type === "invoice") openInvoice(p.url);
      else if (p.type === "none") setNotice(t("order.paymentError"));
    } catch {
      setNotice(t("order.paymentError"));
    }
  };

  if (!order) {
    return (
      <div>
        <PageHeader title={t("order.title", { id })} onBack={onBack} />
        <p className="py-20 text-center text-tg-hint">{t("catalog.loading")}</p>
      </div>
    );
  }

  const cancelled = order.status === "cancelled";
  const stepIndex = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const needsPayment = order.paymentStatus === "unpaid" && !cancelled;

  return (
    <div className="pb-10">
      <PageHeader title={t("order.title", { id: order.id })} onBack={onBack} />
      <div className="space-y-3 p-3">
        <section className="rounded-2xl bg-tg-bg p-4 shadow-sm">
          {cancelled ? (
            <p className="font-semibold text-tg-destructive">❌ {t("status.cancelled")}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-tg-hint">{t("order.thanks")}</p>
              <ol className="space-y-3">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-3">
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${i <= stepIndex ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary text-tg-hint"}`}>
                      {i < stepIndex || order.status === "completed" ? "✓" : i + 1}
                    </span>
                    <span className={i === stepIndex ? "font-semibold" : i < stepIndex ? "" : "text-tg-hint"}>{t(`status.${s}`)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        {needsPayment && (
          <section className="space-y-3 rounded-2xl bg-tg-bg p-4 shadow-sm">
            <p className="font-semibold">💳 {t("order.unpaid")}</p>
            {payment?.type === "manual" ? (
              <>
                <p className="text-sm text-tg-hint">{t("order.manualHint", { total: money(order.total) })}</p>
                <pre className="whitespace-pre-wrap rounded-xl bg-tg-secondary p-3 text-sm">{payment.details}</pre>
                {botUsername && (
                  <button
                    onClick={() => {
                      const url = `https://t.me/${botUsername}`;
                      const wa = getWebApp();
                      if (wa?.openTelegramLink) wa.openTelegramLink(url);
                      else window.open(url, "_blank");
                    }}
                    className="w-full rounded-xl bg-tg-button px-4 py-3 font-semibold text-tg-button-text"
                  >
                    📎 {t("order.openBot")}
                  </button>
                )}
              </>
            ) : (
              <button onClick={pay} className="w-full rounded-xl bg-tg-button px-4 py-3 font-semibold text-tg-button-text">
                {order.paymentMethod === "manual" ? t("order.manualTitle") : `${t("order.payNow")} · ${money(order.total)}`}
              </button>
            )}
            {notice && <p className="text-sm text-tg-destructive">{notice}</p>}
          </section>
        )}
        {!needsPayment && order.paymentStatus === "paid" && (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">✅ {t("order.paid")}</p>
        )}

        <section className="rounded-2xl bg-tg-bg p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">{t("order.items")}</h3>
          <div className="divide-y divide-black/5">
            {order.items.map((i) => (
              <div key={i.id} className="flex justify-between gap-3 py-2 text-[15px]">
                <span className="min-w-0">
                  {i.name}
                  {i.variantName && <span className="text-tg-hint"> · {i.variantName}</span>}
                  <span className="text-tg-hint"> × {i.quantity}</span>
                </span>
                <span className="shrink-0 font-medium">{money(i.price * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1 border-t border-black/5 pt-2 text-sm text-tg-hint">
            {order.discount > 0 && <Line l={`${t("checkout.discount")} (${order.promoCode})`} v={`−${money(order.discount)}`} />}
            <Line l={t("checkout.deliveryFee")} v={order.deliveryFee === 0 ? t("checkout.free") : money(order.deliveryFee)} />
          </div>
          <div className="mt-2 flex justify-between text-lg font-bold">
            <span>{t("checkout.total")}</span>
            <span>{money(order.total)}</span>
          </div>
        </section>

        <section className="space-y-1 rounded-2xl bg-tg-bg p-4 text-sm shadow-sm">
          <p><span className="text-tg-hint">{t("order.delivery")}: </span>{t(`delivery.${order.deliveryMethod}`)} — {order.address}</p>
          <p><span className="text-tg-hint">{t("order.payment")}: </span>{t(`pay.${order.paymentMethod}`)}</p>
        </section>

        <button onClick={onCatalog} className="w-full rounded-xl bg-tg-bg px-4 py-3 font-semibold text-tg-link shadow-sm">
          {t("order.back")}
        </button>
      </div>
    </div>
  );
}

function Line({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span>{l}</span>
      <span className="text-tg-text">{v}</span>
    </div>
  );
}
