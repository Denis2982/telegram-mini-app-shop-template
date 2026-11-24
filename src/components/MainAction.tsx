"use client";

import { useSyncExternalStore } from "react";
import { isInTelegram, useMainButton } from "@/hooks/useTelegram";

interface Props {
  text: string;
  visible?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}

const subscribeToTelegram = () => () => { }
const getServerNativeSnapshot = () => true;

/** Uses Telegram's native MainButton inside Telegram, and a fixed bottom button in a regular browser. */
export function MainAction({ text, visible = true, disabled, loading, onClick }: Props) {
  useMainButton({ text, visible, disabled, loading, onClick });
  const native = useSyncExternalStore(
    subscribeToTelegram,
    isInTelegram,
    getServerNativeSnapshot,
  );
  if (native || !visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-60 mx-auto max-w-xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className="pointer-events-auto w-full cursor-pointer rounded-xl bg-tg-button px-4 py-3.5 text-base font-semibold text-tg-button-text shadow-lg transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "…" : text}
      </button>
    </div>
  );
}
