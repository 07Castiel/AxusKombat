import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

const THROTTLE_MS = 30 * 60 * 1000; // 30 min
const SESSION_KEY = "axk_session_id";
const PAGE_KEY_PREFIX = "axk_page_ts:";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let s = sessionStorage.getItem(SESSION_KEY);
  if (!s) {
    s = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, s);
  }
  return s;
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Other";
}

function detectOS(ua: string): string {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

function detectDevice(ua: string): string {
  if (/Tablet|iPad/i.test(ua)) return "Tablet";
  if (/Mobi|Android.*Mobile|iPhone/i.test(ua)) return "Mobile";
  return "Desktop";
}

export function useVisitorTracking() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${PAGE_KEY_PREFIX}${pathname}`;
    const last = sessionStorage.getItem(key);
    const now = Date.now();
    if (last && now - Number(last) < THROTTLE_MS) return;
    sessionStorage.setItem(key, String(now));

    const ua = navigator.userAgent;
    const payload = {
      user_agent: ua,
      browser: detectBrowser(ua),
      operating_system: detectOS(ua),
      device_type: detectDevice(ua),
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      current_page: pathname,
      referrer: document.referrer || null,
      session_id: getSessionId(),
      user_id: user?.id ?? null,
    };

    // Fire-and-forget, non-blocking
    setTimeout(() => {
      fetch("/api/public/track-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => { /* silent */ });
    }, 0);
  }, [pathname, user?.id]);
}
