import type { DbOrder, DbOrderItem, DbUser } from "@/db/schema";
import type { PaymentInstruction, PaymentMethod } from "@/types";

export interface PaymentContext {
  order: DbOrder;
  items: DbOrderItem[];
  user: DbUser;
}

/** Abstract payment provider. Add a new class + register it in ./index.ts to support another gateway. */
export interface IPaymentProvider {
  readonly id: PaymentMethod;
  isEnabled(): boolean;
  /** Prepares payment for an order and returns what the client must do next. */
  createPayment(ctx: PaymentContext): Promise<PaymentInstruction>;
}
