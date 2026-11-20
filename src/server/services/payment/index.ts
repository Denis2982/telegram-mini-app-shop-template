import type { PaymentMethod } from "@/types";
import { CardProvider } from "./card.provider";
import { ManualProvider } from "./manual.provider";
import type { IPaymentProvider } from "./payment.interface";
import { StarsProvider } from "./stars.provider";

const providers: IPaymentProvider[] = [new StarsProvider(), new CardProvider(), new ManualProvider()];

export const getEnabledProviders = () => providers.filter((p) => p.isEnabled());
export const getProvider = (id: string): IPaymentProvider | undefined =>
  providers.find((p) => p.id === (id as PaymentMethod) && p.isEnabled());

export type { IPaymentProvider } from "./payment.interface";
