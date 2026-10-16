import { getSafeReturnTo } from "./return-to";

const stateKey = "rallyNavigation";
const sessionKey = "rally-navigation-session-v1";
type Entry = { session: string; key: string; path: string; back: boolean; y: number };
let memorySession = "";
let stopRestoring: (() => void) | undefined;
let pendingRestore: Entry | null = null;
let renderedPath = "";
let saveCurrentPosition: (() => void) | undefined;

export function isAppScreen(path: string) {
  const pathname = path.split(/[?#]/)[0];
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") &&
    pathname !== "/login" && !pathname.startsWith("/api/") && !pathname.startsWith("/my/notifications/open/");
}

export function readEntry(state: unknown): Entry | null {
  if (!state || typeof state !== "object" || !(stateKey in state)) return null;
  const value = (state as Record<string, unknown>)[stateKey];
  if (!value || typeof value !== "object") return null;
  const entry = value as Entry;
  return typeof entry.session === "string" && typeof entry.key === "string" && typeof entry.path === "string" &&
    typeof entry.back === "boolean" && Number.isFinite(entry.y) && entry.y >= 0 ? entry : null;
}

export function canReturnWithinApp(state: unknown, session: string) {
  const entry = readEntry(state);
  return Boolean(entry && entry.session === session && entry.back && isAppScreen(entry.path));
}

function currentPath() { return location.pathname + location.search + location.hash; }
function session() {
  try {
    const saved = sessionStorage.getItem(sessionKey);
    if (saved) { memorySession = saved; return saved; }
  } catch { /* Private storage may be unavailable. */ }
  if (!memorySession) memorySession = crypto.randomUUID();
  try { sessionStorage.setItem(sessionKey, memorySession); } catch { /* Keep navigation usable without storage. */ }
  return memorySession;
}
function withEntry(state: unknown, entry: Entry) {
  return { ...(state && typeof state === "object" ? state : {}), [stateKey]: entry };
}

/** Only route metadata and scroll offsets are stored, never API responses or form contents. */
export function resetNavigationHistory() {
  stopRestoring?.(); pendingRestore = null;
  memorySession = crypto.randomUUID();
  try { sessionStorage.setItem(sessionKey, memorySession); } catch { /* In-memory isolation still works. */ }
  const entry: Entry = { session: memorySession, key: crypto.randomUUID(), path: currentPath(), back: false, y: 0 };
  history.replaceState(withEntry(history.state, entry), "");
}

export function returnWithinApp(fallback: string, replace: (path: string) => void) {
  saveCurrentPosition?.();
  if (canReturnWithinApp(history.state, session())) { history.back(); return; }
  const safe = getSafeReturnTo(fallback);
  replace(isAppScreen(safe) ? safe : "/");
}

/** Called after React commits the destination, then waits for its list request to finish. */
export function restoreAfterRender(path: string) {
  renderedPath = path;
  const entry = pendingRestore;
  if (!entry || entry.path.split("#")[0] !== path) return;
  stopRestoring?.();
  let frame = 0;
  let finishing = false;
  const stop = () => {
    cancelAnimationFrame(frame); clearTimeout(timeout);
    observer.disconnect(); resize.disconnect();
    for (const type of ["touchstart", "wheel", "keydown"]) window.removeEventListener(type, cancel);
    if (stopRestoring === stop) stopRestoring = undefined;
  };
  const cancel = () => { pendingRestore = null; stop(); };
  const attempt = () => {
    const loading = Array.from(document.querySelectorAll("[data-navigation-loading]")).some(node => node.getClientRects().length > 0);
    if (finishing || currentPath() !== entry.path || loading) return;
    finishing = true;
    frame = requestAnimationFrame(() => {
      const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      window.scrollTo({ top: Math.min(entry.y, max), behavior: "instant" });
      frame = requestAnimationFrame(() => { pendingRestore = null; stop(); });
    });
  };
  const observer = new MutationObserver(attempt);
  const resize = new ResizeObserver(attempt);
  observer.observe(document.body, { childList: true, subtree: true });
  resize.observe(document.body);
  const timeout = window.setTimeout(cancel, 15_000);
  for (const type of ["touchstart", "wheel", "keydown"]) window.addEventListener(type, cancel, { passive: true });
  stopRestoring = stop;
  frame = requestAnimationFrame(attempt);
}

export function installNavigationHistory() {
  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);
  const oldScrollRestoration = history.scrollRestoration;
  history.scrollRestoration = "manual";
  const createEntry = (path: string, back = false): Entry => ({ session: session(), key: crypto.randomUUID(), path, back, y: 0 });
  const existing = readEntry(history.state);
  if (existing?.session === session() && isAppScreen(currentPath())) {
    if (existing.y > 0) pendingRestore = existing;
  } else originalReplace(withEntry(history.state, createEntry(currentPath())), "");

  function saveScroll() {
    if (pendingRestore) return;
    const entry = readEntry(history.state);
    const y = Math.max(0, scrollY);
    if (entry?.session === session() && entry.path === currentPath() && entry.y !== y) {
      originalReplace(withEntry(history.state, { ...entry, y }), "");
    }
  }
  saveCurrentPosition = saveScroll;
  history.pushState = (data, unused, url) => {
    saveScroll(); stopRestoring?.(); pendingRestore = null;
    const previous = readEntry(history.state);
    const target = new URL(url ?? location.href, location.href);
    const path = target.pathname + target.search + target.hash;
    const back = previous?.session === session() && isAppScreen(previous.path) && isAppScreen(path);
    originalPush(withEntry(data, createEntry(path, back)), unused, url);
  };
  history.replaceState = (data, unused, url) => {
    const target = new URL(url ?? location.href, location.href);
    const path = target.pathname + target.search + target.hash;
    const supplied = readEntry(data);
    const current = readEntry(history.state);
    const base = supplied?.session === session() ? supplied : current;
    const entry = base?.session === session() && isAppScreen(base.path) && isAppScreen(path)
      ? { ...base, path } : createEntry(path);
    originalReplace(withEntry(data, entry), unused, url);
  };
  function onPop(event: PopStateEvent) {
    stopRestoring?.();
    const entry = readEntry(event.state);
    if (!entry || entry.session !== session() || !isAppScreen(entry.path)) {
      // Do not restore the router's pre-logout cache. Revalidate on the server.
      event.stopImmediatePropagation();
      location.replace(isAppScreen(currentPath()) ? currentPath() : "/");
      return;
    }
    // Native anchor links can copy the previous state. Let the browser/router
    // position the anchor instead of applying the copied page offset.
    if (entry.path !== currentPath()) { pendingRestore = null; return; }
    pendingRestore = entry;
    // Cached routes may commit before this listener. Cover both event/render orders.
    restoreAfterRender(renderedPath);
  }
  let scrollTimer = 0;
  // WebKit rate-limits History writes. Save when scrolling settles, and flush
  // before navigation/edge gestures, rather than replacing state every frame.
  function onScroll() { clearTimeout(scrollTimer); scrollTimer = window.setTimeout(saveScroll, 400); }
  function onHide(event: PageTransitionEvent) {
    saveScroll();
    if (event.persisted) document.documentElement.style.visibility = "hidden";
  }
  function onShow(event: PageTransitionEvent) {
    if (event.persisted && readEntry(history.state)?.session !== session()) { location.reload(); return; }
    document.documentElement.style.visibility = "";
  }
  // Capture runs before the router's popstate listener, including native edge gestures.
  window.addEventListener("popstate", onPop, true);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointerdown", saveScroll, { capture: true, passive: true });
  window.addEventListener("touchstart", saveScroll, { capture: true, passive: true });
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  return () => {
    saveScroll(); clearTimeout(scrollTimer); stopRestoring?.(); pendingRestore = null;
    if (saveCurrentPosition === saveScroll) saveCurrentPosition = undefined;
    history.pushState = originalPush; history.replaceState = originalReplace;
    history.scrollRestoration = oldScrollRestoration;
    window.removeEventListener("popstate", onPop, true);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("pointerdown", saveScroll, true);
    window.removeEventListener("touchstart", saveScroll, true);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
  };
}
