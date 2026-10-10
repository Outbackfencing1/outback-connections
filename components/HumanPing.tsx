"use client";
// components/HumanPing.tsx — mounted once in the root layout.
// Tells /api/visit "a person is on this page", once per page, on the first
// real input (tap, click, key, mouse move or wheel). Scrapers that never run
// JavaScript, automated browsers (navigator.webdriver) and scripted events
// (isTrusted false) never send it, so the traction gate only counts a visit
// as human once this has arrived from the same daily session.
// The first ping of a page load also carries where the visit came from
// (see lib/visit-sources.ts). No cookie, no storage, no third party.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { buildVisitPayload } from "@/lib/visit-sources";

const INPUTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;

// Module state lives for one full page load. The entry payload is worked out
// on the landing page (before any client-side navigation drops its utm_ tags)
// and sent with the first ping only.
let entryBody: string | null = null;
let entryWorkedOut = false;

function send(body: string) {
  try {
    if (navigator.sendBeacon?.("/api/visit", new Blob([body], { type: "text/plain" }))) return;
  } catch {
    // fall through to fetch
  }
  fetch("/api/visit", {
    method: "POST",
    body,
    keepalive: true,
    credentials: "same-origin",
    headers: { "content-type": "text/plain" },
  }).catch(() => {});
}

export default function HumanPing() {
  const pathname = usePathname();

  useEffect(() => {
    if (navigator.webdriver) return;
    if (!entryWorkedOut) {
      entryWorkedOut = true;
      const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
      const payload = buildVisitPayload({
        href: window.location.href,
        referrer: document.referrer,
        privacySignal: nav.globalPrivacyControl === true || nav.doNotTrack === "1",
      });
      entryBody = "entry" in payload ? JSON.stringify(payload) : null;
    }

    const stop = () => INPUTS.forEach((t) => window.removeEventListener(t, onInput, true));
    function onInput(e: Event) {
      if (!e.isTrusted) return;
      stop();
      const body = entryBody ?? "{}";
      entryBody = null;
      send(body);
    }
    INPUTS.forEach((t) => window.addEventListener(t, onInput, { capture: true, passive: true }));
    return stop;
  }, [pathname]);

  return null;
}
