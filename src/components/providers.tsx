"use client";

import { ThemeProvider } from "next-themes";
import { useCallback, useSyncExternalStore } from "react";

// Hide-amounts: a per-browser preference. The attribute on <html> is set before
// paint by HIDE_AMOUNTS_SCRIPT, and CSS masks every `.money` element (globals.css).

export const HIDE_AMOUNTS_KEY = "psx-tracker:hide-amounts";
const CHANGE_EVENT = "psx-tracker:hide-amounts-change";

/** Runs in <head> before first paint so amounts never flash. */
export const HIDE_AMOUNTS_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(HIDE_AMOUNTS_KEY)})==="1")document.documentElement.dataset.hideAmounts=""}catch(e){}`;

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}
const readHidden = () => "hideAmounts" in document.documentElement.dataset;

export function useHideAmounts() {
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const toggle = useCallback(() => {
    const next = !readHidden();
    if (next) document.documentElement.dataset.hideAmounts = "";
    else delete document.documentElement.dataset.hideAmounts;
    try {
      localStorage.setItem(HIDE_AMOUNTS_KEY, next ? "1" : "0");
    } catch {
      // Storage blocked: the toggle still works for this page view.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return { hidden, toggle };
}

const noopSubscribe = () => () => {};
/** False during server render and hydration, true afterwards. */
export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
