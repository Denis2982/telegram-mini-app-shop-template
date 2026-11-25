"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MainAction } from "@/components/MainAction";
import { ProductImageFallback } from "@/components/ProductImageFallback";
import { haptic } from "@/hooks/useTelegram";
import { useCartStore } from "@/store/useCartStore";
import { useT } from "@/store/useShopStore";
import type { ProductDto } from "@/types";

export function ProductModal({ product, onClose }: { product: ProductDto; onClose: () => void }) {
  const { t, money } = useT();
  const add = useCartStore((s) => s.add);
  const firstAvailable = product.variants.find((v) => v.inStock) ?? product.variants[0];
  const [variantId, setVariantId] = useState<number | null>(firstAvailable?.id ?? null);
  const [qty, setQty] = useState(1);
  const [slide, setSlide] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const gallery = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const variant = useMemo(() => product.variants.find((v) => v.id === variantId) ?? null, [product, variantId]);
  const price = variant?.price ?? product.price;
  const stock = variant ? variant.stock : product.stock;
  const available = stock > 0;
  const q = Math.min(qty, Math.max(stock, 1));

  const submit = () => {
    if (!available) return;
    add(product, variantId, q);
    haptic.success();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="sheet-up relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-tg-bg pb-28">
        <button onClick={onClose} aria-label={t("product.close")} className="absolute right-3 top-3 z-10 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/50 text-white transition hover:bg-black/70 active:scale-95">
          ✕
        </button>

        {product.images.length > 0 ? (
          <div className="relative">
            <div
              ref={gallery}
              onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
              className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
            >
              {product.images.map((src, i) => (
                failedImages.includes(src) ? (
                  <ProductImageFallback key={i} label={t("product.noImage")} className="aspect-square w-full shrink-0 snap-center" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={product.name} onError={() => setFailedImages((current) => current.includes(src) ? current : [...current, src])} className="aspect-square w-full shrink-0 snap-center object-cover" />
                )
              ))}
            </div>
            {product.images.length > 1 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                {product.images.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === slide ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <ProductImageFallback label={t("product.noImage")} className="aspect-square w-full" />
        )}

        <div className="space-y-4 p-4">
          <div>
            <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-2xl font-bold">{money(price)}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${available ? (stock <= 5 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700") : "bg-red-100 text-red-700"}`}>
                {available ? (stock <= 5 ? t("product.lowStock", { n: stock }) : t("product.inStock")) : t("product.outOfStock")}
              </span>
            </div>
          </div>

          {product.variants.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-tg-hint">{t("product.variant")}</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      haptic.select();
                      setVariantId(v.id);
                      setQty(1);
                    }}
                    disabled={!v.inStock}
                    className={`cursor-pointer rounded-xl border px-3.5 py-2 text-sm transition hover:brightness-95 ${
                      v.id === variantId ? "border-tg-button bg-tg-button font-semibold text-tg-button-text" : "border-black/10 bg-tg-secondary"
                    } ${v.inStock ? "" : "line-through opacity-40"}`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {available && (
            <div className="flex items-center gap-3">
              <Stepper value={q} max={stock} onChange={(n) => setQty(Math.max(1, n))} />
              <span className="text-sm text-tg-hint">× {money(price)} = <b className="text-tg-text">{money(price * q)}</b></span>
            </div>
          )}

          {product.description && (
            <div>
              <h3 className="mb-1 font-semibold">{t("product.description")}</h3>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-tg-hint">{product.description}</p>
            </div>
          )}

          {Object.keys(product.specs).length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">{t("product.specs")}</h3>
              <dl className="divide-y divide-black/5 rounded-xl bg-tg-secondary text-sm">
                {Object.entries(product.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-3 py-2">
                    <dt className="text-tg-hint">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
      <MainAction text={available ? t("product.addFor", { price: money(price * q) }) : t("product.outOfStock")} disabled={!available} onClick={submit} />
    </div>
  );
}

export function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl bg-tg-secondary">
      <button onClick={() => onChange(Math.max(0, value - 1))} className="h-9 w-9 cursor-pointer rounded-l-xl text-xl transition hover:bg-tg-bg active:opacity-60">−</button>
      <span className="min-w-8 text-center text-[15px] font-semibold">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="h-9 w-9 cursor-pointer rounded-r-xl text-xl transition hover:bg-tg-bg active:opacity-60 disabled:cursor-not-allowed disabled:opacity-30">+</button>
    </div>
  );
}
