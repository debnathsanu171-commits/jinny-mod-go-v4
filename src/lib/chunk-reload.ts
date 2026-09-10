const KEY = "jmg-chunk-reload";

export function hardOpenApp(path = "/projects") {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  const url = new URL(path, window.location.origin);
  url.searchParams.set("_jmg", String(Date.now()));
  window.location.replace(url.toString());
}

/** Returns true if a cache-busting reload was triggered. */
export function maybeAutoReloadStale(): boolean {
  try {
    const n = Number(sessionStorage.getItem(KEY) || "0");
    if (n >= 2) return false;
    sessionStorage.setItem(KEY, String(n + 1));
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_jmg", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

export function clearStaleReloadFlag() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("_jmg")) return;
  url.searchParams.delete("_jmg");
  const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
  window.history.replaceState({}, "", next);
}
