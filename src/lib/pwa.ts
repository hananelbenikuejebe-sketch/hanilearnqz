import { useEffect, useState, useCallback } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
const listeners = new Set<() => void>();

function notify() { listeners.forEach((l) => l()); }

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installedFlag = true;
    deferredPrompt = null;
    notify();
  });
}

export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as any).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

export function isSamsungInternet(): boolean {
  if (typeof navigator === "undefined") return false;
  return /SamsungBrowser/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/** React hook exposing install state + a one-tap install trigger. */
export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(() => !!deferredPrompt);
  const [installed, setInstalled] = useState(() => installedFlag || isRunningStandalone());

  useEffect(() => {
    const update = () => {
      setCanInstall(!!deferredPrompt);
      setInstalled(installedFlag || isRunningStandalone());
    };
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") installedFlag = true;
    deferredPrompt = null;
    notify();
    return choice.outcome === "accepted";
  }, []);

  return {
    canInstall,
    isInstalled: installed,
    promptInstall,
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isSamsungInternet: isSamsungInternet(),
  };
}
