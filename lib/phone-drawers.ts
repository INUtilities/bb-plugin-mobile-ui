import { readSidebarChrome, SIDEBAR_CHROME_EVENT } from "./sidebar-chrome.ts";
import { postSlideHaptic, readNativeBridge } from "./sidebar-depth.ts";
import { DRAWER_EXPANSION_CSS, injectDrawerExpansion } from "./drawer-expansion.ts";

// Defer only while Chat UI's phone bridge is active; new-thread pages may have no bridge.
export const PHONE_DRAWER_SELECTOR = `[data-persistent-drawer-content]:not(
  html[data-bb-chat-ui-root-device="phone"] :is(
    [data-bb-plugin="bb--composer"],
    [data-bb-chat-ui-pr-menu],
    [data-bb-chat-ui-model-menu],
    [data-bb-chat-ui-option-menu],
    :has(> div[aria-label="Prompt actions"])
  )
)`;
const PHONE = "html[data-bb-sidebar-phone]";
const DRAWER = `${PHONE} ${PHONE_DRAWER_SELECTOR}`;
const GRAB = "color-mix(in oklab, var(--muted-foreground) 45%, transparent)";

/** Chat UI phone-sheet reference: 8px inset, 30px corners, 40×4px grabber, one frost face. */
const CSS = `
${DRAWER} {
  --bb-mobile-sheet-face: oklch(from var(--background) min(1, calc(l + 0.075)) c h / 0.68);
  --bb-mobile-sheet-edge: color-mix(in oklab, var(--popover) 35%, transparent);
  --bb-mobile-sheet-shadow: color-mix(in oklab, var(--ink, var(--foreground)) 22%, transparent);
  left: 8px !important;
  right: 8px !important;
  width: auto !important;
  max-width: none !important;
  max-height: calc(92dvh - var(--bb-drawer-keyboard-inset, 0px) - 8px) !important;
  border: 0 !important;
  border-radius: 30px !important;
  overflow: hidden;
  padding-bottom: max(0px, calc(var(--bb-safe-area-bottom, env(safe-area-inset-bottom, 0px)) - 8px)) !important;
  color: var(--foreground);
  background: var(--bb-mobile-sheet-face) !important;
  backdrop-filter: blur(14px) saturate(1.25);
  -webkit-backdrop-filter: blur(14px) saturate(1.25);
  box-shadow: 0 12px 32px -14px var(--bb-mobile-sheet-shadow), inset 0 1px 3px var(--bb-mobile-sheet-edge) !important;
}
html.dark[data-bb-sidebar-phone] ${PHONE_DRAWER_SELECTOR} {
  --bb-mobile-sheet-face: oklch(from var(--background) min(1, calc(l + 0.075)) c h / 0.76);
  --bb-mobile-sheet-edge: color-mix(in oklab, var(--foreground) 8%, transparent);
  --bb-mobile-sheet-shadow: color-mix(in oklab, var(--ink, var(--background)) 60%, transparent);
}
/* Add to the host transform, never replace it or its keyboard-owned inline bottom. */
${DRAWER}[data-state="open"] { translate: 0 -8px; }
${DRAWER} > [data-persistent-drawer-handle] {
  height: 24px !important;
  padding-top: 8px;
  align-items: flex-start !important;
  background: transparent !important;
}
${DRAWER} > [data-persistent-drawer-handle] > div {
  width: 40px !important;
  height: 4px !important;
  background: ${GRAB} !important;
}
${PHONE} [data-persistent-drawer-backdrop] { background: transparent !important; }
${DRAWER_EXPANSION_CSS}
`;

/** Style only the shared host primitive. Native layout, focus and gestures own its DOM. */
export function injectPhoneDrawers(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) return () => {};
  const stopExpansion = injectDrawerExpansion(doc);
  let style: HTMLStyleElement | null = null;
  let lastHandleAt = -Infinity;
  const onHandlePress = (event: PointerEvent) => {
    if (readSidebarChrome(doc).device !== "phone" || event.button !== 0 || event.isPrimary === false) return;
    const target = event.target as Element | null;
    const handle = target?.closest?.("[data-persistent-drawer-handle]");
    const drawer = handle?.parentElement;
    if (!drawer?.matches(PHONE_DRAWER_SELECTOR) || drawer.getAttribute("data-state") !== "open") return;
    const now = view.performance.now();
    if (now - lastHandleAt < 400) return;
    if (postSlideHaptic(readNativeBridge(doc), "impact-light")) lastHandleAt = now;
  };
  const sync = () => {
    if (readSidebarChrome(doc).device !== "phone") {
      style?.remove();
      style = null;
    } else if (!style) {
      style = doc.createElement("style");
      style.id = "bb-mobile-phone-drawers";
      style.textContent = CSS;
      doc.head.append(style);
    }
  };
  sync();
  view.addEventListener(SIDEBAR_CHROME_EVENT, sync);
  doc.addEventListener("pointerdown", onHandlePress, true);
  return () => {
    stopExpansion();
    view.removeEventListener(SIDEBAR_CHROME_EVENT, sync);
    doc.removeEventListener("pointerdown", onHandlePress, true);
    style?.remove();
    style = null;
  };
}
