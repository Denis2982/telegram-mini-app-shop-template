"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { MainAction } from "@/components/MainAction";
import { getWebApp, haptic } from "@/hooks/useTelegram";
import { cartSubtotal, useCartStore } from "@/store/useCartStore";
import { useShopStore, useT } from "@/store/useShopStore";
import type { DeliveryMethod, OrderDto, PaymentInstruction, PaymentMethod } from "@/types";

const DELIVERY: DeliveryMethod[] = ["courier", "pickup", "post"];
const inputCls = "w-full rounded-xl bg-tg-secondary px-4 py-3 text-[15px] outline-none placeholder:text-tg-hint focus:ring-2 focus:ring-tg-button/40";

export function CheckoutForm({ onCreated }: { onCreated: (order: OrderDto, payment: PaymentInstruction) => void }) {
  const { t, money } = useT();
  const config = useShopStore((s) => s.config)!;
  const lines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);
  const subtotal = cartSubtotal(lines);

  const tgUser = getWebApp()?.initDataUnsafe?.user;
  const [name, setName] = useState([tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" "));
  const [phone, setPhone] = useState("");
  const [delivery, setDelivery] = useState<DeliveryMethod>("courier");
  const [address, setAddress] = useState("");
  const [pickup, setPickup] = useState(config.delivery.pickupPoints[0] ?? "");
  const [payment, setPayment] = useState<PaymentMethod>(config.paymentMethods[0] ?? "manual");
  const [comment, setComment] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoError, setPromoError] = useState<"invalid" | "auth" | "request" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Re-validate an applied promo when the subtotal changes.
  useEffect(() => {
    if (!promo) return;
    api.checkPromo(promo.code, subtotal).then((r) => setPromo(r.valid ? { code: r.code!, discount: r.discount! } : null)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const discount = promo?.discount ?? 0;
  const fee = useMemo(() => {
    if (delivery === "pickup") return 0;
    const d = config.delivery;
    if (d.freeFrom > 0 && subtotal - discount >= d.freeFrom) return 0;
    return delivery === "post" ? d.postFee : d.courierFee;
  }, [delivery, subtotal, discount, config.delivery]);
  const total = subtotal - discount + fee;
  const finalAddress = delivery === "pickup" ? pickup : address;

  const applyPromo = async () => {
    setPromoError(null);
    if (!promoInput.trim()) return;
    try {
      const r = await api.checkPromo(promoInput, subtotal);
      if (r.valid) {
        setPromo({ code: r.code!, discount: r.discount! });
        haptic.success();
      } else {
        setPromo(null);
        setPromoError("invalid");
        haptic.error();
      }
    } catch (error) {
      setPromo(null);
      setPromoError(error instanceof Error && error.message === "Unauthorized" ? "auth" : "request");
    }
  };

  const requestPhone = () => {
    const wa = getWebApp();
    if (!wa) return;
    wa.requestContact((sent, ev) => {
      const p = ev?.responseUnsafe?.contact?.phone_number;
      if (sent && p) setPhone(p.startsWith("+") ? p : `+${p}`);
    });
  };

  const submit = async () => {
    if (busy) return;
    setError("");
    if (!name.trim() || !phone.trim() || !finalAddress.trim()) {
      setError(t("checkout.errorRequired"));
      haptic.error();
      return;
    }
    setBusy(true);
    try {
      const res = await api.createOrder({
        items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.qty })),
        deliveryMethod: delivery,
        paymentMethod: payment,
        address: finalAddress,
        name,
        phone,
        comment,
        promoCode: promo?.code,
      });
      haptic.success();
      clear();
      onCreated(res.order, res.payment);
    } catch (e) {
      haptic.error();
      setError(e instanceof Error ? e.message : t("checkout.errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const radio = (active: boolean) =>
    `flex-1 cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm transition hover:brightness-95 active:scale-[0.98] ${active ? "border-tg-button bg-tg-button font-semibold text-tg-button-text" : "border-black/10 bg-tg-secondary"}`;

  return (
    <div className="space-y-3">
      <Section title={t("checkout.title")}>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("checkout.name")} autoComplete="name" />
        <div className="flex gap-2">
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("checkout.phone")} inputMode="tel" autoComplete="tel" />
          {getWebApp()?.initData && (
            <button onClick={requestPhone} className="shrink-0 cursor-pointer rounded-xl bg-tg-secondary px-3 py-2 text-xs font-medium text-tg-link transition hover:bg-tg-bg">
              📱 {t("checkout.requestPhone")}
            </button>
          )}
        </div>
      </Section>

      <Section title={t("checkout.delivery")}>
        <div className="flex gap-2">
          {DELIVERY.map((d) => (
            <button key={d} onClick={() => setDelivery(d)} className={radio(delivery === d)}>
              {t(`delivery.${d}`)}
            </button>
          ))}
        </div>
        {delivery === "pickup" ? (
          <select className={inputCls} value={pickup} onChange={(e) => setPickup(e.target.value)} aria-label={t("checkout.pickupPoint")}>
            {config.delivery.pickupPoints.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        ) : (
          <textarea className={`${inputCls} min-h-20 resize-none`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("checkout.address")} autoComplete="street-address" />
        )}
      </Section>

      <Section title={t("checkout.promo")}>
        <div className="flex gap-2">
          <input className={`${inputCls} uppercase`} value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder={t("checkout.promoPlaceholder")} />
          <button onClick={applyPromo} className="shrink-0 cursor-pointer rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text transition hover:brightness-95 active:scale-[0.98]">
            {t("checkout.apply")}
          </button>
        </div>
        {promo && <p className="text-sm text-emerald-600">✓ {t("checkout.promoApplied", { discount: money(promo.discount) })}</p>}
        {promoError && (
          <p className="text-sm text-tg-destructive">
            {t(promoError === "invalid" ? "checkout.promoInvalid" : promoError === "auth" ? "checkout.promoAuthRequired" : "checkout.promoCheckFailed")}
          </p>
        )}
      </Section>

      <Section title={t("checkout.payment")}>
        <div className="flex flex-col gap-2">
          {config.paymentMethods.map((m) => (
            <button key={m} onClick={() => setPayment(m)} className={`${radio(payment === m)} text-left`}>
              {t(`pay.${m}`)}
            </button>
          ))}
        </div>
        <textarea className={`${inputCls} min-h-16 resize-none`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("checkout.comment")} />
      </Section>

      <section className="space-y-1.5 rounded-2xl bg-tg-bg p-4 text-[15px] shadow-sm">
        <Row label={t("checkout.subtotal")} value={money(subtotal)} />
        {discount > 0 && <Row label={t("checkout.discount")} value={`−${money(discount)}`} />}
        <Row label={t("checkout.deliveryFee")} value={fee === 0 ? t("checkout.free") : money(fee)} />
        <div className="flex justify-between border-t border-black/5 pt-2 text-lg font-bold">
          <span>{t("checkout.total")}</span>
          <span>{money(total)}</span>
        </div>
      </section>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <MainAction text={busy ? t("checkout.submitting") : t("checkout.submit", { total: money(total) })} loading={busy} onClick={submit} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-tg-hint">
      <span>{label}</span>
      <span className="text-tg-text">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-2xl bg-tg-bg p-4 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}
