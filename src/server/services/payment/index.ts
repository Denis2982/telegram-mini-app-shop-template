import type { PaymentMethod } from "@/types";
import { getConfig, type AppConfig } from "../../config";
import { CardProvider } from "./card.provider";
import { ManualProvider } from "./manual.provider";
import type { IPaymentProvider } from "./payment.interface";
import { StarsProvider } from "./stars.provider";

const providers: IPaymentProvider[] = [new StarsProvider(), new CardProvider(), new ManualProvider()];

export const getEnabledProviders = (cfg: AppConfig = getConfig()) =>
  providers.filter((p) => (p.id === "manual" ? Boolean(cfg.manualDetails) : p.isEnabled()));
export const getProvider = (id: string, cfg: AppConfig = getConfig()): IPaymentProvider | undefined =>
  providers.find(
    (p) => p.id === (id as PaymentMethod) && (p.id === "manual" ? Boolean(cfg.manualDetails) : p.isEnabled()),
  );

export type { IPaymentProvider } from "./payment.interface";
