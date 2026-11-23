export type OrderStatus = "new" | "paid" | "processing" | "shipped" | "completed" | "cancelled";
export type PaymentMethod = "stars" | "card" | "manual";
export type DeliveryMethod = "courier" | "pickup" | "post";

export interface VariantDto {
  id: number;
  name: string;
  price: number;
  stock: number;
  inStock: boolean;
}

export interface ProductDto {
  id: number;
  sku: string;
  name: string;
  description: string;
  categoryId: number | null;
  categoryName: string | null;
  price: number;
  images: string[];
  specs: Record<string, string>;
  stock: number;
  inStock: boolean;
  active: boolean;
  variants: VariantDto[];
}

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
}

export interface OrderItemDto {
  id: number;
  productId: number | null;
  variantId: number | null;
  name: string;
  variantName: string | null;
  image: string | null;
  price: number;
  quantity: number;
}

export interface OrderDto {
  id: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: "unpaid" | "paid";
  deliveryMethod: DeliveryMethod;
  address: string;
  customerName: string;
  customerPhone: string;
  customerUsername: string | null;
  customerTelegramId: number | null;
  comment: string;
  promoCode: string | null;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  currency: string;
  createdAt: string;
  items: OrderItemDto[];
}

export type PaymentInstruction =
  | { type: "invoice"; url: string }
  | { type: "manual"; details: string }
  | { type: "none"; error?: string };

export interface ClientConfig {
  storeName: string;
  currencyCode: string;
  currencySymbol: string;
  locale: string;
  dict: Record<string, string>;
  paymentMethods: PaymentMethod[];
  delivery: {
    courierFee: number;
    postFee: number;
    freeFrom: number;
    pickupPoints: string[];
  };
  botUsername: string;
  isDevAuth: boolean;
}

export interface StoreSettingsDto {
  manualDetails: string;
  pickupPoints: string[];
  currencyCode: string;
  currencySymbol: string;
}

export interface CreateOrderInput {
  items: { productId: number; variantId?: number | null; quantity: number }[];
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  address: string;
  name: string;
  phone: string;
  comment?: string;
  promoCode?: string;
}
