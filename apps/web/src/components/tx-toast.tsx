"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { robinhoodChain } from "@cluby/config";

type Toast = { id: number; text: string; hash?: `0x${string}`; tone: "pending" | "done" | "error" };

const ToastContext = createContext<{ push: (t: Omit<Toast, "id">) => number; resolve: (id: number, t: Omit<Toast, "id">) => void } | null>(null);

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts outside ToastProvider");
  return ctx;
}

const explorer = robinhoodChain.blockExplorers?.default.url ?? "";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    // A finished toast clears itself; a pending one stays until it is resolved.
    if (t.tone !== "pending") setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 12_000);
    return id;
  }, []);

  const resolve = useCallback((id: number, t: Omit<Toast, "id">) => {
    setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, ...t } : x)));
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 12_000);
  }, []);

  const value = useMemo(() => ({ push, resolve }), [push, resolve]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[min(24rem,calc(100vw-3rem))] flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-2xl border p-4 text-sm shadow-lg ${
              t.tone === "error"
                ? "border-down/30 bg-white text-down"
                : t.tone === "done"
                  ? "border-up/30 bg-white text-text-strong"
                  : "border-line bg-white text-text-strong"
            }`}
          >
            <p>{t.text}</p>
            {t.hash && explorer && (
              <a
                href={`${explorer}/tx/${t.hash}`}
                target="_blank"
                rel="noreferrer"
                className="num mt-2 block break-all text-xs text-brand underline underline-offset-4"
              >
                {t.hash.slice(0, 18)}…
              </a>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
