import { getWebApp } from "@/hooks/useTelegram";
import type {
  CategoryDto,
  ClientConfig,
  CreateOrderInput,
  OrderDto,
  PaymentInstruction,
  ProductDto,
} from "@/types";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const initData = getWebApp()?.initData;
  if (initData) headers.set("Authorization", `tma ${initData}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  config: (lang?: string) => request<ClientConfig>(`/api/config${lang ? `?lang=${lang}` : ""}`),
  categories: () => request<CategoryDto[]>("/api/categories"),
  products: (qs: URLSearchParams) => request<ProductDto[]>(`/api/products?${qs.toString()}`),
  checkPromo: (code: string, subtotal: number) =>
    request<{ valid: boolean; code?: string; discount?: number }>("/api/promo", {
      method: "POST",
      body: JSON.stringify({ code, subtotal }),
    }),
  createOrder: (input: CreateOrderInput) =>
    request<{ order: OrderDto; payment: PaymentInstruction }>("/api/orders", { method: "POST", body: JSON.stringify(input) }),
  orders: () => request<OrderDto[]>("/api/orders"),
  order: (id: number) => request<OrderDto>(`/api/orders/${id}`),
  payOrder: (id: number) => request<PaymentInstruction>(`/api/orders/${id}/pay`, { method: "POST" }),
};
