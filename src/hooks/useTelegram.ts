"use client";

import { useEffect } from "react";

export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string } };
  ready(): void;
  expand(): void;
  openInvoice(url: string, cb?: (status: "paid" | "cancelled" | "failed" | "pending") => void): void;
  openTelegramLink(url: string): void;
  requestContact(cb: (sent: boolean, event?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void): void;
  showAlert(msg: string): void;
  HapticFeedback: {
    impactOccurred(s: "light" | "medium" | "heavy"): void;
    notificationOccurred(s: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  MainButton: {
    setParams(p: { text?: string; is_visible?: boolean; is_active?: boolean }): void;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    showProgress(leave?: boolean): void;
    hideProgress(): void;
  };
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function getWebApp(): TgWebApp | undefined {
  return typeof window === "undefined" ? undefined : window.Telegram?.WebApp;
}

/** True only when opened inside Telegram (signed initData present). */
export function isInTelegram() {
  return Boolean(getWebApp()?.initData);
}

export function initTelegram() {
  const wa = getWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
}

export const haptic = {
  light: () => getWebApp()?.HapticFeedback?.impactOccurred("light"),
  select: () => getWebApp()?.HapticFeedback?.selectionChanged(),
  success: () => getWebApp()?.HapticFeedback?.notificationOccurred("success"),
  error: () => getWebApp()?.HapticFeedback?.notificationOccurred("error"),
};

export function useBackButton(visible: boolean, onClick: () => void) {
  useEffect(() => {
    const wa = getWebApp();
    if (!wa?.initData || !visible) return;
    wa.BackButton.show();
    wa.BackButton.onClick(onClick);
    return () => {
      wa.BackButton.offClick(onClick);
      wa.BackButton.hide();
    };
  }, [visible, onClick]);
}

/** Drives the native Telegram MainButton. Returns true when native button is used. */
export function useMainButton(opts: { text: string; visible: boolean; disabled?: boolean; loading?: boolean; onClick: () => void }) {
  const { text, visible, disabled, loading, onClick } = opts;
  useEffect(() => {
    const wa = getWebApp();
    if (!wa?.initData || !visible) return;
    wa.MainButton.setParams({ text, is_visible: true, is_active: !disabled && !loading });
    if (loading) wa.MainButton.showProgress(true);
    else wa.MainButton.hideProgress();
    wa.MainButton.onClick(onClick);
    return () => {
      wa.MainButton.offClick(onClick);
      wa.MainButton.hideProgress();
      wa.MainButton.hide();
    };
  }, [text, visible, disabled, loading, onClick]);
}
