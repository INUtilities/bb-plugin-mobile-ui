import { EASE } from "./motion.ts";
import { readSidebarChrome, SIDEBAR_CHROME_EVENT } from "./sidebar-chrome.ts";
import { postSlideHaptic, readNativeBridge } from "./sidebar-depth.ts";

const STAGE = "data-bb-mobile-sheet-stage";
const SETTLING = "data-bb-mobile-sheet-settling";
const PANEL = "[data-persistent-drawer-content]";
const VARS = ["inset", "height", "gap", "radius", "offset"].map(name => `--bb-mobile-sheet-${name}`);
// Chat UI's collapsed face uses :not(#bb-chat-ui-sheet); expansion must override that face's geometry.
const S = `html[data-bb-sidebar-phone] ${PANEL}[${STAGE}][data-state="open"]:not(#bb-mobile-sheet-expansion):not(#bb-mobile-sheet-geometry)`;

// Expansion also serves Chat UI's native drawers: Chat UI owns their collapsed face, not a controller.
export const DRAWER_EXPANSION_CSS = `
${S} {
  left: var(--bb-mobile-sheet-inset) !important;
  right: var(--bb-mobile-sheet-inset) !important;
  width: auto !important;
  height: var(--bb-mobile-sheet-height) !important;
  min-height: 0 !important;
  max-height: none !important;
  margin-top: 0 !important;
  border-radius: 30px 30px var(--bb-mobile-sheet-radius) var(--bb-mobile-sheet-radius) !important;
  padding-bottom: max(0px, calc(var(--bb-safe-area-bottom, env(safe-area-inset-bottom, 0px)) - var(--bb-mobile-sheet-gap))) !important;
  translate: 0 calc(var(--bb-mobile-sheet-offset) - var(--bb-mobile-sheet-gap)) !important;
  transform: none !important;
  transition: none !important;
}
${S}[${SETTLING}] {
  transition: left 320ms ${EASE.out}, right 320ms ${EASE.out}, height 320ms ${EASE.out},
    translate 320ms ${EASE.out}, border-radius 320ms ${EASE.out}, padding-bottom 320ms ${EASE.out} !important;
}
@media (prefers-reduced-motion: reduce) { ${S}[${SETTLING}] { transition: none !important; } }
`;

type Sheet = {
  drawer: HTMLElement;
  top: number;
  height: number;
  expandedHeight: number;
  overdrag: number;
  stretch: number;
  distance: number;
  expanded: boolean;
  progress: number;
  timer: number;
  observer: MutationObserver;
};
type Drag = { sheet: Sheet; handle: Element; id: number; y0: number; top0: number;
  expanded: boolean; own: boolean; y: number; time: number; velocity: number; top: number };

/** Keep downward drags native. Only an upward/expanded handle gesture needs the adapter. */
export function injectDrawerExpansion(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) return () => {};
  const sheets = new Map<HTMLElement, Sheet>();
  let drag: Drag | null = null;
  let forwardingCancel = false;
  const reduced = () => view.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const clear = (sheet: Sheet) => {
    view.clearTimeout(sheet.timer);
    sheet.observer.disconnect();
    sheet.drawer.removeAttribute(STAGE);
    sheet.drawer.removeAttribute(SETTLING);
    for (const name of VARS) sheet.drawer.style.removeProperty(name);
    sheets.delete(sheet.drawer);
    if (drag?.sheet === sheet) drag = null;
    if (sheets.size === 0) portals.disconnect();
  };
  // Observe portal removal only while a sheet is managed. Chat streaming is not observed.
  const portals = new view.MutationObserver(() => {
    for (const sheet of sheets.values()) if (!sheet.drawer.isConnected) clear(sheet);
  });
  const render = (sheet: Sheet, progress: number, offset = 0) => {
    const p = Math.max(0, Math.min(1, progress));
    sheet.progress = p;
    sheet.drawer.setAttribute(STAGE, sheet.expanded ? "expanded" : "dragging");
    const extraHeight = Math.min(sheet.overdrag, Math.max(0, -offset));
    sheet.stretch = extraHeight;
    const values = [8 * (1 - p), sheet.height + (sheet.expandedHeight - sheet.height) * p + extraHeight,
      8 * (1 - p), 30 * (1 - p), Math.max(0, offset)];
    values.forEach((value, index) => sheet.drawer.style.setProperty(VARS[index]!, `${value}px`));
  };
  const settle = (sheet: Sheet, expanded: boolean) => {
    const changed = expanded !== sheet.expanded;
    sheet.expanded = expanded;
    if (!reduced()) sheet.drawer.setAttribute(SETTLING, "");
    render(sheet, expanded ? 1 : 0);
    if (changed) postSlideHaptic(readNativeBridge(doc));
    const done = () => { sheet.drawer.removeAttribute(SETTLING); if (!expanded) clear(sheet); };
    if (reduced()) done();
    else sheet.timer = view.setTimeout(done, 340);
  };
  // The host saw pointerdown and owns capture. Cancel its pending drag without invoking close.
  const cancelNative = (current: Drag) => {
    forwardingCancel = true;
    try {
      const Pointer = view.PointerEvent ?? view.MouseEvent;
      current.handle.dispatchEvent(new Pointer("pointercancel", {
        bubbles: true, pointerId: current.id, clientY: current.y, button: 0,
      }));
    } finally { forwardingCancel = false; }
  };
  const down = (event: PointerEvent) => {
    if (forwardingCancel) return;
    if (drag) {
      if (event.pointerId !== drag.id && (event.target as Element | null)?.closest?.("[data-persistent-drawer-handle]") === drag.handle) {
        event.preventDefault(); event.stopPropagation();
      }
      return;
    }
    if (event.button !== 0 || event.isPrimary === false || readSidebarChrome(doc).device !== "phone") return;
    const handle = (event.target as Element | null)?.closest?.("[data-persistent-drawer-handle]");
    const drawer = handle?.parentElement;
    if (!handle || !drawer?.matches(`${PANEL}[data-state="open"]`)) return;
    let sheet = sheets.get(drawer);
    if (!sheet) {
      const rect = drawer.getBoundingClientRect();
      if (rect.height <= 0) return;
      const frameTop = doc.querySelector("[data-thread-window]")?.getBoundingClientRect().top ?? 0;
      const expandedTop = Math.min(rect.top, Math.max(frameTop, view.visualViewport?.offsetTop ?? 0) + 8);
      const observer = new view.MutationObserver(() => {
        const current = sheets.get(drawer);
        if (current && drawer.getAttribute("data-state") !== "open") clear(current);
      });
      sheet = { drawer, top: rect.top, height: rect.height,
        expandedHeight: rect.bottom + 8 - expandedTop, distance: Math.max(48, rect.top - expandedTop),
        overdrag: Math.max(0, expandedTop - (view.visualViewport?.offsetTop ?? 0)), stretch: 0,
        expanded: false, progress: 0, timer: 0, observer };
      sheets.set(drawer, sheet);
      observer.observe(drawer, { attributes: true, attributeFilter: ["data-state"] });
      portals.observe(doc.body, { childList: true });
    }
    view.clearTimeout(sheet.timer);
    if (sheet.drawer.hasAttribute(SETTLING)) {
      const visibleInset = Number.parseFloat(view.getComputedStyle(sheet.drawer).left);
      const visibleHeight = sheet.drawer.getBoundingClientRect().height;
      const progress = Number.isFinite(visibleInset) ? 1 - visibleInset / 8 : sheet.progress;
      const restingHeight = sheet.height + (sheet.expandedHeight - sheet.height) * progress;
      sheet.drawer.removeAttribute(SETTLING);
      render(sheet, progress, -Math.max(0, visibleHeight - restingHeight));
    }
    sheet.drawer.removeAttribute(SETTLING);
    drag = { sheet, handle, id: event.pointerId, y0: event.clientY,
      top0: sheet.top - sheet.distance * sheet.progress - sheet.stretch,
      expanded: sheet.expanded, own: sheet.expanded || sheet.progress > 0,
      y: event.clientY, time: view.performance.now(), velocity: 0,
      top: sheet.top - sheet.distance * sheet.progress - sheet.stretch };
  };
  const move = (event: PointerEvent) => {
    const current = drag;
    if (!current || current.id !== event.pointerId) return;
    const now = view.performance.now();
    current.velocity = (event.clientY - current.y) / Math.max(1, now - current.time);
    current.y = event.clientY; current.time = now;
    if (!current.own && event.clientY - current.y0 < -6) current.own = true;
    if (!current.own) return;
    event.preventDefault(); event.stopPropagation();
    current.top = current.top0 + event.clientY - current.y0;
    const sheet = current.sheet;
    const pastMaximum = current.top - (sheet.top - sheet.distance);
    render(sheet, (sheet.top - current.top) / sheet.distance,
      pastMaximum < 0 ? pastMaximum : Math.max(0, current.top - sheet.top));
  };
  const end = (event: PointerEvent) => {
    if (forwardingCancel) return;
    const current = drag;
    if (!current || current.id !== event.pointerId) return;
    drag = null;
    const sheet = current.sheet;
    if (!current.own) { clear(sheet); return; }
    const cancelled = event.type === "pointercancel";
    // Far enough below the collapsed stage: let the original host pointerup close it.
    if (!cancelled && current.top > sheet.top + sheet.height * 0.25) { clear(sheet); return; }
    event.preventDefault(); event.stopPropagation();
    cancelNative(current);
    const projected = current.top + current.velocity * 140;
    const aboveMaximum = current.top < sheet.top - sheet.distance;
    settle(sheet, cancelled ? current.expanded : aboveMaximum || projected < sheet.top - sheet.distance / 2);
  };
  const reset = () => {
    if (drag?.own) cancelNative(drag);
    drag = null;
    for (const sheet of sheets.values()) clear(sheet);
  };
  doc.addEventListener("pointerdown", down, true);
  doc.addEventListener("pointermove", move, { capture: true, passive: false });
  doc.addEventListener("pointerup", end, true);
  doc.addEventListener("pointercancel", end, true);
  view.addEventListener(SIDEBAR_CHROME_EVENT, reset);
  view.addEventListener("resize", reset);
  view.visualViewport?.addEventListener("resize", reset);
  return () => {
    reset(); portals.disconnect();
    doc.removeEventListener("pointerdown", down, true);
    doc.removeEventListener("pointermove", move, true);
    doc.removeEventListener("pointerup", end, true);
    doc.removeEventListener("pointercancel", end, true);
    view.removeEventListener(SIDEBAR_CHROME_EVENT, reset);
    view.removeEventListener("resize", reset);
    view.visualViewport?.removeEventListener("resize", reset);
  };
}
