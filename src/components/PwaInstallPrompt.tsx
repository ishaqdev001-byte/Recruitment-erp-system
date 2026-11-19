"use client";

import { useCallback, useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function supportsManualInstall(userAgent: string) {
  return (
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) &&
      /Safari/i.test(userAgent) &&
      !/Chrome|Chromium|Edg/i.test(userAgent))
  );
}

export default function PwaInstallPrompt({
  companySlug,
  companyName,
  companyLogo,
}: {
  companySlug: string;
  companyName: string;
  companyLogo?: string;
}) {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installError, setInstallError] = useState("");
  const dismissalKey = `kilax.pwa-install-dismissed:${companySlug}`;

  const saveDismissal = useCallback(() => {
    try {
      window.localStorage.setItem(dismissalKey, "true");
    } catch (error) {
      console.warn("Unable to persist the PWA prompt preference.", error);
    }
    setShowPrompt(false);
    setInstallPrompt(null);
  }, [dismissalKey]);

  useEffect(() => {
    document.documentElement.dataset.pwaInstallPromptOpen = String(showPrompt);
    window.dispatchEvent(new Event("kilax:pwa-install-prompt"));

    return () => {
      delete document.documentElement.dataset.pwaInstallPromptOpen;
      window.dispatchEvent(new Event("kilax:pwa-install-prompt"));
    };
  }, [showPrompt]);

  useEffect(() => {
    const slug = encodeURIComponent(companySlug);
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = `/api/companies/${slug}/manifest`;
    manifestLink.dataset.companyPwaManifest = "true";

    const appleCapable = document.createElement("meta");
    appleCapable.name = "apple-mobile-web-app-capable";
    appleCapable.content = "yes";
    appleCapable.dataset.companyPwa = "true";

    const appleTitle = document.createElement("meta");
    appleTitle.name = "apple-mobile-web-app-title";
    appleTitle.content = companyName.slice(0, 12);
    appleTitle.dataset.companyPwa = "true";

    const appleTouchIcon = document.createElement("link");
    appleTouchIcon.rel = "apple-touch-icon";
    appleTouchIcon.href = companyLogo
      ? companyLogo.startsWith("https://")
        ? companyLogo
        : `/api/companies/${slug}/logo`
      : "/branding/kilax-icon.svg";
    appleTouchIcon.dataset.companyPwa = "true";

    const isDismissed = () => {
      try {
        return Boolean(window.localStorage.getItem(dismissalKey));
      } catch (error) {
        console.warn("Unable to read the PWA prompt preference.", error);
        return false;
      }
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isDismissed()) return;
      setInstallPrompt(event as InstallPromptEvent);
      setShowPrompt(true);
    };

    const handleAppInstalled = saveDismissal;

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    window.addEventListener("appinstalled", handleAppInstalled);
    document.head.append(
      manifestLink,
      appleCapable,
      appleTitle,
      appleTouchIcon,
    );

    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error: unknown) =>
          console.error("Service worker registration failed", error),
        );
    }

    const userAgent = navigator.userAgent;
    if (
      !isStandalone() &&
      supportsManualInstall(userAgent) &&
      !isDismissed()
    ) {
      setShowPrompt(true);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      manifestLink.remove();
      appleCapable.remove();
      appleTitle.remove();
      appleTouchIcon.remove();
    };
  }, [companyLogo, companyName, companySlug, dismissalKey, saveDismissal]);

  const installApp = async () => {
    if (!installPrompt) return;

    setInstallError("");
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      saveDismissal();
    } catch (error) {
      console.error("PWA installation prompt failed", error);
      setInstallError("Unable to open the installation prompt. Try again later.");
    }
  };

  if (!showPrompt) return null;

  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
    >
      <section
        className="w-full max-w-md rounded-2xl border p-5 shadow-2xl sm:p-6"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <h2
          id="pwa-install-title"
          className="text-lg font-700"
          style={{ color: "var(--foreground)" }}
        >
          Install {companyName}
        </h2>
        {installPrompt ? (
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            Add the company workspace to your device for quick access.
          </p>
        ) : (
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {isAppleMobile
              ? "To install, tap Share in Safari, then choose Add to Home Screen."
              : "In Safari, open File and choose Add to Dock to install this workspace."}
          </p>
        )}
        {installError && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {installError}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={saveDismissal}
            className="rounded border px-4 py-2 text-sm font-600"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            Not now
          </button>
          {installPrompt ? (
            <button
              type="button"
              onClick={() => void installApp()}
              className="rounded px-4 py-2 text-sm font-600"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              Install app
            </button>
          ) : (
            <button
              type="button"
              onClick={saveDismissal}
              className="rounded px-4 py-2 text-sm font-600"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              Got it
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
