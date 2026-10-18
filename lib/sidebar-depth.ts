import {
  SIDEBAR_CHROME_EVENT,
  DEFAULT_SIDEBAR_CHROME,
  clearSidebarChrome,
  readSidebarChrome,
  usesPhoneShelf,
  writeSidebarChrome,
  type SidebarChrome,
} from "./sidebar-chrome.ts";

const STYLE_ID = "bb-motion";
const DEPTH_VAR = "--lite-sidebar-depth";
const RIGHT_DEPTH_VAR = "--bb-motion-right-depth";
const PARKED = "liteSidebarParked";
const RIGHT_PARKED = "bbMotionRightParked";
const RIGHT_PIN = "bbMotionPin";
const RIGHT_SETTLED = "bbMotionSettled";
const CHAT_DIM = "bbMotionChatDim";
const CHAT_DIM_VAR = "--bb-motion-chat-dim";
const SCREEN = "bbMotionScreen";
const SCREEN_MOVE_PX = 1;
const RIGHT_HOLD = 0.75;
const SLIDE_MS = 720;
const SLIDE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const RIGHT_PANEL = "[data-panel] > aside";
const RIGHT_SHELF = '[data-testid="secondary-panel-shelf"]';
const RIGHT_TAB_ROOT =
  '[data-sidebar-split-tab-group], [aria-label="Right panel views"], [data-testid="mobile-panel-tab-pager"], [data-testid="secondary-panel-tab-strip"]';
const TAB_VIEWPORT = '[data-testid="mobile-panel-tab-viewport"]';
const TAB_PAGER = '[data-testid="mobile-panel-tab-pager"]';
const TAB_SWIPE_PX = 30;
const TAB_SWIPE_QUIET_MS = 500;

const RIGHT_DEPTH_LOOK = `
  opacity: 1;
`;

const SIDEBAR_DEPTH_CSS = `
[data-sidebar="gap"] {
  transition: width ${SLIDE_MS}ms ${SLIDE_EASE} !important;
}
[data-sidebar="panel"] {
  ${DEPTH_VAR}: 1;
  filter: brightness(calc(0.7 + var(${DEPTH_VAR}) * 0.3));
  opacity: 1;
  transition:
    left ${SLIDE_MS}ms ${SLIDE_EASE},
    width ${SLIDE_MS}ms ${SLIDE_EASE},
    visibility 0s linear 0s !important;
  visibility: visible !important;
}
:where(:root[data-bb-sidebar-phone]) [data-sidebar="panel"][data-vaul-drawer-direction="left"] {
  transform: translateX(calc((1 - var(${DEPTH_VAR})) * -50%));
}
[data-sidebar="panel"][data-lite-sidebar-parked] {
  pointer-events: none;
  visibility: hidden !important;
}
${RIGHT_PANEL} {
  ${RIGHT_DEPTH_VAR}: 1;
  ${RIGHT_DEPTH_LOOK}
}
${RIGHT_PANEL}[data-bb-motion-right-parked] {
  pointer-events: none;
}
${RIGHT_SHELF} {
  z-index: 0 !important;
  ${RIGHT_DEPTH_VAR}: 1;
  ${RIGHT_DEPTH_LOOK}
}
${RIGHT_SHELF}[data-state="closed"] {
  visibility: hidden !important;
  transition: visibility 0s linear ${SLIDE_MS}ms !important;
}
/* bb-sidebar-phone-shelf */
@media --bb-sidebar-phone {
  [data-sidebar="inset"][data-bb-motion-screen] {
    border-radius: 55px;
    overflow: clip;
    box-shadow: -12px 0 24px rgb(0 0 0 / 0.10);
  }
  [data-sidebar="inset"][data-panel-shelf="shelf"],
  [data-sidebar="inset"][data-panel-shelf="full"] {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    box-shadow: 67px 0 0 0 var(--background);
  }
  [data-sidebar="panel"][data-vaul-drawer-direction="left"] {
    border-right-color: transparent;
    box-shadow: 67px 0 0 0 var(--sidebar);
  }
  [data-testid="secondary-panel-shelf"] {
    background-color: var(--sidebar);
    z-index: 40 !important;
    border-top-left-radius: 48px;
    border-bottom-left-radius: 48px;
    corner-shape: squircle;
    border-left-color: transparent;
    overflow: clip;
  }
  [data-testid="secondary-panel-shelf"]:not([data-bb-motion-settled]) {
    transform: translateX(calc((1 - min(var(${RIGHT_DEPTH_VAR}), 0.75) / 0.75) * 100%));
  }
  [data-sidebar="inset"][data-bb-motion-chat-dim] {
    filter: brightness(calc(1 - var(--bb-motion-chat-dim) * 0.45));
    transform: translateX(calc(var(--bb-motion-chat-dim) * 50%));
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-sidebar="gap"],
  [data-sidebar="panel"],
  ${RIGHT_PANEL},
  ${RIGHT_SHELF},
  [data-sidebar="inset"][data-bb-motion-chat-dim] {
    filter: none !important;
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
`;

export function sidebarDepthCss(chrome: SidebarChrome = DEFAULT_SIDEBAR_CHROME): string {
  if (chrome.device !== "phone") return "";
  return SIDEBAR_DEPTH_CSS.replace(
    "@media --bb-sidebar-phone",
    usesPhoneShelf(chrome) ? "@media all" : "@media not all",
  );
}

export function keepWatchingSlide(idleMs: number): boolean {
  return idleMs < SLIDE_MS;
}

export function sidebarDepthProgress(box: { left: number; width: number }): number {
  if (box.width <= 0) return 0;
  return clamp((box.left + box.width) / box.width);
}

export function rightPanelDepthProgress(
  panel: { left: number; right: number; width: number },
  clip: { left: number; right: number },
): number {
  if (panel.width <= 0) return 0;
  const visible = Math.max(0, Math.min(panel.right, clip.right) - Math.max(panel.left, clip.left));
  return clamp(visible / panel.width);
}

export function rightShelfProgress(translateX: number, width: number): number {
  if (width <= 0 || translateX >= 0) return 0;
  return clamp(-translateX / width);
}

export function mobileShelfProgress(translateX: number, width: number): number {
  if (width <= 0) return 0;
  return clamp(translateX / width);
}

export function readTranslateX(
  style: { translate?: string; transform?: string },
  referenceWidth = 0,
): number {
  const translate = style.translate ?? "";
  if (translate !== "" && translate !== "none") {
    return parseTranslateToken(translate.trim().split(/\s+/)[0] ?? "", referenceWidth);
  }
  const transform = style.transform ?? "";
  if (transform === "" || transform === "none") return 0;
  if (typeof DOMMatrix !== "undefined") {
    try {
      return new DOMMatrix(transform).m41;
    } catch {
      return 0;
    }
  }
  if (transform.startsWith("matrix3d(")) {
    const nums = transform.slice(9, -1).split(",").map((n) => Number.parseFloat(n));
    return nums[12] || 0;
  }
  if (transform.startsWith("matrix(")) {
    const nums = transform.slice(7, -1).split(",").map((n) => Number.parseFloat(n));
    return nums[4] || 0;
  }
  return 0;
}

export type SidebarSide = "left" | "right" | "rest";
export type SidebarHaptic = "open" | "close";
export type SidebarPhase = { side: SidebarSide; closeSent: boolean };

export function readSidebarSide(sample: {
  translateX: number;
  sidebarShelf: string | null;
  panelShelf: string | null;
}): SidebarSide {
  if (sample.translateX > SCREEN_MOVE_PX) return "left";
  if (sample.translateX < -SCREEN_MOVE_PX) return "right";
  if (sample.sidebarShelf === "open") return "left";
  if (sample.panelShelf === "shelf" || sample.panelShelf === "full") return "right";
  return "rest";
}

export function nextSidebarPhase(
  phase: SidebarPhase,
  sample: { translateX: number; sidebarShelf: string | null; panelShelf: string | null },
): { phase: SidebarPhase; haptics: SidebarHaptic[] } {
  const motion: SidebarSide =
    sample.translateX > SCREEN_MOVE_PX ? "left" : sample.translateX < -SCREEN_MOVE_PX ? "right" : "rest";
  const attr: SidebarSide =
    sample.sidebarShelf === "open"
      ? "left"
      : sample.panelShelf === "shelf" || sample.panelShelf === "full"
        ? "right"
        : "rest";
  const visible = readSidebarSide(sample);
  if (phase.side === "rest" && visible !== "rest") {
    return { phase: { side: visible, closeSent: false }, haptics: ["open"] };
  }
  if (phase.side !== "rest" && attr !== phase.side && motion === phase.side && !phase.closeSent) {
    return { phase: { side: phase.side, closeSent: true }, haptics: ["close"] };
  }
  if (phase.closeSent && visible === "rest") {
    return { phase: { side: "rest", closeSent: false }, haptics: [] };
  }
  if (phase.side !== "rest" && visible === "rest" && !phase.closeSent) {
    return { phase: { side: "rest", closeSent: false }, haptics: ["close"] };
  }
  if (phase.side !== "rest" && visible !== "rest" && visible !== phase.side) {
    return {
      phase: { side: visible, closeSent: false },
      haptics: phase.closeSent ? ["open"] : ["close", "open"],
    };
  }
  return { phase, haptics: [] };
}

const RELEASE_TAP_PX = 12;
const DISMISS_PROGRESS = 0.75;
const DISMISS_FLING_PROGRESS = 0.88;
const RELEASE_FLING_PX_PER_S = 450;
const SWIPE_OPEN_RATIO = 0.33;
const SWIPE_FLING_RATIO = 0.12;
const SUPPRESS_MS = 1200;
const RELEASE_IGNORED =
  'input, textarea, select, [contenteditable="true"], [role="slider"], [data-vaul-no-drag], [data-no-sidebar-swipe], [data-no-secondary-panel-swipe]';

export type ReleaseTarget =
  | "left-trigger"
  | "right-show"
  | "right-hide"
  | "left-backdrop"
  | "right-dismiss"
  | "left-panel"
  | "right-shelf"
  | "inset"
  | "other";

export type FingerRelease = {
  target: ReleaseTarget;
  deltaX: number;
  deltaY: number;
  velocityX: number;
  width: number;
};

export type FingerHaptic = {
  haptics: SidebarHaptic[];
  suppress: SidebarHaptic[];
  settle: SidebarSide | null;
};

const NO_FINGER_HAPTIC: FingerHaptic = { haptics: [], suppress: [], settle: null };

export function isRightPanelLauncherPress(target: EventTarget | null): boolean {
  const button = asElement(target)?.closest("button");
  if (button === null || button === undefined || button.getAttribute("disabled") !== null) return false;
  if (button.closest('[data-testid="new-tab-actions"]') !== null) {
    const id = button.getAttribute("id") ?? "";
    return id.startsWith("plugin-action:") || id.startsWith("file-search-result-");
  }
  return button.getAttribute("role") === "option"
    && button.closest('[role="listbox"]')?.getAttribute("aria-label") === "File search results";
}

export function isRightPanelTabPress(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (element === null) return false;
  const button = element.closest("button");
  if (button === null || button.getAttribute("disabled") !== null) return false;
  if (button.closest(RIGHT_TAB_ROOT) === null) return false;
  if (button.getAttribute("data-tab-pill-close") !== null) return true;
  if (button.getAttribute("aria-pressed") !== null) return true;
  if (button.getAttribute("data-panel-new-tab") !== null) return true;
  const label = button.getAttribute("aria-label");
  return label === "Previous tab" || label === "Next tab" || label?.startsWith("Close ") === true;
}

export function rightPanelTabSwipe(
  start: { x: number; y: number } | null,
  end: { x: number; y: number } | null,
): "previous" | "next" | null {
  if (start === null || end === null) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < TAB_SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? "next" : "previous";
}

export function readReleaseTarget(target: EventTarget | null): ReleaseTarget {
  const element = asElement(target);
  if (element === null) return "other";
  const button = element.closest('button, [role="button"]');
  if (button !== null) {
    const label = button.getAttribute("aria-label") ?? "";
    if (label.startsWith("Show right panel")) return "right-show";
    if (label.startsWith("Hide right panel")) return "right-hide";
    if (button.matches('[data-sidebar="trigger"]') || button.closest('[data-sidebar="trigger"]') !== null) {
      return "left-trigger";
    }
  }
  if (element.closest('[data-sidebar="trigger"]') !== null) return "left-trigger";
  if (element.closest(RELEASE_IGNORED) !== null) return "other";
  if (element.closest('[data-testid="secondary-panel-shelf-dismiss"]') !== null) return "right-dismiss";
  if (element.closest("[data-sidebar-mobile-backdrop]") !== null) return "left-backdrop";
  if (element.closest(RIGHT_SHELF) !== null) return "right-shelf";
  if (element.closest('[data-sidebar="panel"]') !== null) return "left-panel";
  if (element.closest('[data-sidebar="inset"]') !== null) return "inset";
  return "other";
}

export function sidebarFingerRelease(
  phase: SidebarPhase,
  release: FingerRelease,
  held: readonly SidebarHaptic[] = [],
): FingerHaptic {
  if (release.target === "left-trigger" && isReleaseTap(release)) {
    if (phase.side === "left") return closeSide(phase, held, "left");
    return openSide(phase, [], "left", true);
  }
  if (release.target === "right-show" && isReleaseTap(release)) {
    if (phase.side === "left" && held.length === 0) return NO_FINGER_HAPTIC;
    return openSide(phase, [], "right", false);
  }
  if (release.target === "right-hide" && isReleaseTap(release)) {
    if (phase.side === "left") return NO_FINGER_HAPTIC;
    return closeSide(phase, held, "right");
  }
  if (release.target === "left-backdrop" && (isReleaseTap(release) || dismisses(release, -1))) {
    return closeSide(phase, held, "left");
  }
  if (release.target === "right-dismiss" && (isReleaseTap(release) || dismisses(release, 1))) {
    return closeSide(phase, held, "right");
  }
  if (release.target === "left-panel" && dismisses(release, -1)) return closeSide(phase, held, "left");
  if (release.target === "right-shelf" && dismisses(release, 1)) return closeSide(phase, held, "right");
  if (release.target === "inset" && swipeOpens(release)) return openSide(phase, held, "left", true);
  if (release.target === "inset" && horizontalIntent(release, 1)) return cancelOpenedSwipe(phase, held);
  return NO_FINGER_HAPTIC;
}

function openSide(
  phase: SidebarPhase,
  held: readonly SidebarHaptic[],
  side: "left" | "right",
  switchFromOther: boolean,
): FingerHaptic {
  const other = side === "left" ? "right" : "left";
  if (phase.side === side && held.includes("close") && held.includes("open")) {
    return { haptics: ["close", "open"], suppress: [], settle: null };
  }
  if (phase.side === other && held.length === 0) {
    if (!switchFromOther) return NO_FINGER_HAPTIC;
    return { haptics: ["close", "open"], suppress: ["close", "open"], settle: null };
  }
  if (phase.side === side && held.includes("open")) {
    return { haptics: ["open"], suppress: [], settle: null };
  }
  if (phase.side === side) return NO_FINGER_HAPTIC;
  return { haptics: ["open"], suppress: ["open"], settle: null };
}

function closeSide(phase: SidebarPhase, held: readonly SidebarHaptic[], side: "left" | "right"): FingerHaptic {
  if (phase.side === side && phase.closeSent) {
    return held.includes("close") ? { haptics: ["close"], suppress: [], settle: null } : NO_FINGER_HAPTIC;
  }
  if (phase.side === "rest" && held.includes("close")) {
    return { haptics: ["close"], suppress: [], settle: null };
  }
  if (phase.side === "rest") return { haptics: ["close"], suppress: ["open", "close"], settle: null };
  if (phase.side !== side) return NO_FINGER_HAPTIC;
  return { haptics: ["close"], suppress: ["close"], settle: null };
}

function cancelOpenedSwipe(phase: SidebarPhase, held: readonly SidebarHaptic[]): FingerHaptic {
  if (phase.side === "left" && held.length === 0) return NO_FINGER_HAPTIC;
  if (phase.side === "right" || held.includes("close")) {
    return { haptics: [], suppress: [], settle: "right" };
  }
  return { haptics: [], suppress: [], settle: "rest" };
}

function isReleaseTap(release: FingerRelease): boolean {
  return Math.abs(release.deltaX) < RELEASE_TAP_PX && Math.abs(release.deltaY) < RELEASE_TAP_PX;
}

function horizontalIntent(release: FingerRelease, direction: 1 | -1): boolean {
  const absX = Math.abs(release.deltaX);
  const absY = Math.abs(release.deltaY);
  if (absY > RELEASE_TAP_PX && absY > absX * 1.15) return false;
  if (release.deltaX * direction < RELEASE_TAP_PX || absX <= absY * 1.25) return false;
  return true;
}

function dismisses(release: FingerRelease, direction: 1 | -1): boolean {
  if (release.width <= 0 || !horizontalIntent(release, direction)) return false;
  const progress = 1 - (release.deltaX * direction) / release.width;
  return (
    progress <= DISMISS_PROGRESS ||
    (progress <= DISMISS_FLING_PROGRESS && release.velocityX * direction >= RELEASE_FLING_PX_PER_S)
  );
}

function swipeOpens(release: FingerRelease): boolean {
  if (release.width <= 0 || !horizontalIntent(release, 1)) return false;
  const progress = Math.min(1, release.deltaX / release.width);
  return progress >= SWIPE_OPEN_RATIO || (progress >= SWIPE_FLING_RATIO && release.velocityX >= RELEASE_FLING_PX_PER_S);
}

export function applyChatScreen(inset: HTMLElement, translateX: number): "push" | null {
  const wasOn = inset.dataset[SCREEN] !== undefined;
  const shelf = inset.getAttribute("data-sidebar-shelf");
  const panelShelf = inset.getAttribute("data-panel-shelf");
  const heldOpen = shelf === "open" || panelShelf === "shelf" || panelShelf === "full";
  const on = heldOpen || Math.abs(translateX) > SCREEN_MOVE_PX;
  if (on) inset.dataset[SCREEN] = "";
  else delete inset.dataset[SCREEN];
  return on && !wasOn ? "push" : null;
}

export function blurComposerCaret(doc: Document): boolean {
  const active = doc.activeElement;
  if (active == null || typeof active.closest !== "function") return false;
  if (active.closest("[data-promptbox]") === null) return false;
  const blur = Reflect.get(active, "blur");
  if (typeof blur !== "function") return false;
  blur.call(active);
  return true;
}

export type SlideHapticKind = "selection" | "impact-light";

export function slideHapticKind(side: SidebarSide): SlideHapticKind {
  return side === "left" ? "impact-light" : "impact-light";
}

export function postSlideHaptic(
  native: {
    post?: (message: unknown) => void;
    capabilities?: readonly string[];
  } | null,
  kind: SlideHapticKind = "impact-light",
): boolean {
  if (native === null || typeof native.post !== "function") return false;
  if (!native.capabilities?.includes("haptic")) return false;
  try {
    native.post({ type: "haptic", kind });
  } catch {
    return false;
  }
  return true;
}

export function applySidebarDepth(panel: HTMLElement, progress: number): void {
  const next = clamp(progress);
  panel.style.setProperty(DEPTH_VAR, String(next));
  if (next <= 0.012) panel.dataset[PARKED] = "";
  else delete panel.dataset[PARKED];
}

export function readSidebarDepth(doc: Document, panel: HTMLElement): number {
  if (readSidebarChrome(doc).device === "phone" && panel.getAttribute("data-vaul-drawer-direction") !== null) {
    const inset = doc.querySelector<HTMLElement>('[data-sidebar="inset"]');
    const width = panel.getBoundingClientRect().width;
    if (inset === null) {
      return panel.getAttribute("data-state") === "open" ? 1 : 0;
    }
    const style = doc.defaultView?.getComputedStyle?.(inset) ?? {
      translate: inset.style.translate,
      transform: inset.style.transform,
    };
    return mobileShelfProgress(readTranslateX(style), width);
  }
  return sidebarDepthProgress(panel.getBoundingClientRect());
}

export function applyChatDim(inset: HTMLElement, progress: number): void {
  const next = clamp(progress);
  if (next <= 0.012) {
    inset.style.removeProperty?.(CHAT_DIM_VAR);
    delete inset.dataset[CHAT_DIM];
    return;
  }
  inset.dataset[CHAT_DIM] = "";
  inset.style.setProperty(CHAT_DIM_VAR, String(next));
}

export function applyRightDepth(panel: HTMLElement, progress: number, pin: boolean): void {
  const next = clamp(progress);
  panel.style.setProperty(RIGHT_DEPTH_VAR, String(next));
  if (pin) panel.dataset[RIGHT_PIN] = "";
  else delete panel.dataset[RIGHT_PIN];
  if (next <= 0.012) panel.dataset[RIGHT_PARKED] = "";
  else delete panel.dataset[RIGHT_PARKED];
  // A resting filter or transform reloads the native browser view and the terminal WebGL canvas.
  // Once open, keep the transform off until the drag passes the host's dismiss line.
  const wasSettled = panel.dataset[RIGHT_SETTLED] !== undefined;
  const settled = wasSettled ? next > RIGHT_HOLD : next >= 0.988;
  if (settled) panel.dataset[RIGHT_SETTLED] = "";
  else delete panel.dataset[RIGHT_SETTLED];
}

export function readRightDepth(aside: HTMLElement): number {
  const clip = aside.parentElement?.getBoundingClientRect();
  if (clip === undefined) return 1;
  return rightPanelDepthProgress(aside.getBoundingClientRect(), clip);
}

export function readRightShelfDepth(doc: Document, shelf: HTMLElement): number {
  const inset = doc.querySelector<HTMLElement>('[data-sidebar="inset"]');
  const width = shelf.getBoundingClientRect().width;
  if (inset === null || width <= 0) {
    return shelf.getAttribute("data-state") === "closed" ? 0 : 1;
  }
  const style = doc.defaultView?.getComputedStyle?.(inset) ?? {
    translate: inset.style.translate,
    transform: inset.style.transform,
  };
  return rightShelfProgress(readTranslateX(style, inset.getBoundingClientRect().width), width);
}

export function syncSidebarDepth(doc: Document): number {
  const chrome = readSidebarChrome(doc);
  if (chrome.device !== "phone") return 0;
  syncChatScreen(doc);
  if (prefersReducedMotion(doc)) return 0;
  let count = 0;
  doc.querySelectorAll<HTMLElement>('[data-sidebar="panel"]').forEach((panel) => {
    applySidebarDepth(panel, readSidebarDepth(doc, panel));
    count += 1;
  });
  doc.querySelectorAll<HTMLElement>(RIGHT_PANEL).forEach((aside) => {
    const pin = aside.style.width !== "";
    if (pin) aside.dataset[RIGHT_PIN] = "";
    else delete aside.dataset[RIGHT_PIN];
    applyRightDepth(aside, readRightDepth(aside), pin);
    count += 1;
  });
  let shelfProgress = 0;
  doc.querySelectorAll<HTMLElement>(RIGHT_SHELF).forEach((shelf) => {
    if (chrome.device !== "phone") return;
    const progress = readRightShelfDepth(doc, shelf);
    shelfProgress = Math.max(shelfProgress, progress);
    applyRightDepth(shelf, progress, false);
    count += 1;
  });
  if (typeof doc.querySelector === "function") {
    const inset = doc.querySelector<HTMLElement>('[data-sidebar="inset"]');
    if (inset !== null) applyChatDim(inset, usesPhoneShelf(chrome) ? shelfProgress : 0);
  }
  return count;
}

export function injectSidebarDepth(
  doc: Document,
  options: { pluginId?: string; chrome?: SidebarChrome } = {},
): () => void {
  const existing = doc.getElementById(STYLE_ID);
  existing?.remove();
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  const view = doc.defaultView;
  writeSidebarChrome(doc, options.chrome ?? readSidebarChrome(doc));
  let stopTrack: () => void = () => {};
  const apply = (): void => {
    stopTrack();
    stopTrack = () => {};
    const chrome = readSidebarChrome(doc);
    // 위치 기반 밝기·스와이프 모션은 phone 전용이다. desktop에서 폭을 매 프레임 읽지 않는다.
    style.textContent = sidebarDepthCss(chrome);
    if (chrome.device === "phone") {
      syncSidebarDepth(doc);
      stopTrack = trackSidebarDepth(doc);
    }
  };
  apply();
  doc.head.append(style);
  const onChrome = (): void => { finger = null; heldHaptics = []; apply(); };
  view?.addEventListener?.(SIDEBAR_CHROME_EVENT, onChrome);
  return () => {
    view?.removeEventListener?.(SIDEBAR_CHROME_EVENT, onChrome);
    stopTrack();
    style.remove();
    clearSidebarChrome(doc);
  };
}

function trackSidebarDepth(doc: Document): () => void {
  if (typeof doc.querySelectorAll !== "function") return () => {};
  const view = doc.defaultView;
  const raf = view?.requestAnimationFrame?.bind(view);
  const cancel = view?.cancelAnimationFrame?.bind(view);
  if (raf === undefined) {
    syncSidebarDepth(doc);
    return () => {};
  }

  let frame = 0;
  let idleFrom = 0;
  let last = "";
  const now = (): number => view?.performance?.now?.() ?? 0;
  let resize: ResizeObserver | null = null;
  const seen = new WeakSet<Element>();
  const watch = (node: Element | null): void => {
    if (node === null || seen.has(node)) return;
    seen.add(node);
    resize?.observe(node);
  };
  const watchAll = (): void => {
    doc.querySelectorAll('[data-sidebar="panel"], [data-sidebar="inset"]').forEach(watch);
    doc.querySelectorAll<HTMLElement>(RIGHT_PANEL).forEach((aside) => {
      watch(aside);
      watch(aside.parentElement);
    });
    doc.querySelectorAll(RIGHT_SHELF).forEach(watch);
  };
  const tick = (time: number): void => {
    watchAll();
    const next = snapshot(doc);
    if (next !== last) {
      last = next;
      idleFrom = time;
      syncSidebarDepth(doc);
    }
    if (keepWatchingSlide(time - idleFrom)) frame = raf(tick);
    else frame = 0;
  };
  const kick = (): void => {
    idleFrom = now();
    if (frame === 0) frame = raf(tick);
  };
  const followSlide = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target.matches(
        '[data-sidebar="inset"], [data-sidebar="panel"], [data-panel] > aside, [data-testid="secondary-panel-shelf"]',
      )
    ) {
      kick();
    }
  };
  resize = typeof ResizeObserver === "function" ? new ResizeObserver(kick) : null;

  kick();
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      if (isSidebarMotionTarget(record.target)) {
        kick();
        return;
      }
    }
  });
  mutations.observe(doc.body ?? doc.documentElement, {
    attributeFilter: [
      "class",
      "data-collapsible",
      "data-panel-shelf",
      "data-sidebar-shelf",
      "aria-hidden",
      "data-state",
      "style",
    ],
    attributes: true,
    subtree: true,
  });
  watchAll();
  let tabSwipe: { x: number; y: number; pager: Element } | null = null;
  let tabSwipeQuietUntil = 0;
  let tabPressAt = -Infinity;
  const buzzPanelPress = (): void => {
    const time = now();
    if (time < tabSwipeQuietUntil || time - tabPressAt < TAB_SWIPE_QUIET_MS) return;
    tabPressAt = time;
    postSlideHaptic(readNativeBridge(doc));
  };
  const buzzTab = (event: Event): void => {
    if (isRightPanelTabPress(event.target)) buzzPanelPress();
  };
  const buzzLauncher = (event: Event): void => {
    if (isRightPanelLauncherPress(event.target)) buzzPanelPress();
  };
  const tabTouchStart = (event: Event): void => {
    const touches = touchPoints(event, "touches");
    const element = asElement(event.target);
    const viewport = element?.closest(TAB_VIEWPORT) ?? null;
    const touch = touches?.[0];
    if (touch === undefined || viewport === null || touches?.length !== 1) {
      tabSwipe = null;
      return;
    }
    tabSwipe = { x: touch.clientX, y: touch.clientY, pager: viewport.closest(TAB_PAGER) ?? viewport };
  };
  const tabTouchEnd = (event: Event): void => {
    const start = tabSwipe;
    tabSwipe = null;
    const touch = touchPoints(event, "changedTouches")?.[0];
    if (start === null || touch === undefined) return;
    const direction = rightPanelTabSwipe(start, { x: touch.clientX, y: touch.clientY });
    if (direction === null) return;
    tabSwipeQuietUntil = now() + TAB_SWIPE_QUIET_MS;
    const label = direction === "next" ? "Next tab" : "Previous tab";
    const control = start.pager.querySelector?.(`button[aria-label="${label}"]`);
    if (control === null || control === undefined || control.getAttribute("disabled") !== null) return;
    postSlideHaptic(readNativeBridge(doc));
  };
  const tabTouchCancel = (): void => {
    tabSwipe = null;
  };
  const downFinger = (event: Event): void => trackFingerDown(doc, event);
  const moveFinger = (event: Event): void => trackFingerMove(doc, event);
  const upFinger = (event: Event): void => trackFingerUp(doc, event);
  view?.addEventListener("click", buzzTab, true);
  view?.addEventListener("pointerup", buzzTab, true);
  // Wait for an actual activation; scrolling and reorder gestures are not row clicks.
  view?.addEventListener("click", buzzLauncher);
  view?.addEventListener("touchstart", tabTouchStart, true);
  view?.addEventListener("touchend", tabTouchEnd, true);
  view?.addEventListener("touchcancel", tabTouchCancel, true);
  view?.addEventListener("pointerdown", kick, true);
  view?.addEventListener("pointermove", kick, true);
  view?.addEventListener("pointerdown", downFinger, true);
  view?.addEventListener("pointermove", moveFinger, true);
  view?.addEventListener("pointerup", upFinger, true);
  view?.addEventListener("pointercancel", upFinger, true);
  view?.addEventListener("touchstart", downFinger, true);
  view?.addEventListener("touchmove", moveFinger, true);
  view?.addEventListener("touchend", upFinger, true);
  view?.addEventListener("touchcancel", upFinger, true);
  view?.addEventListener("wheel", kick, { capture: true, passive: true });
  view?.addEventListener("resize", kick);
  view?.addEventListener("transitionrun", followSlide, true);
  view?.addEventListener("transitionend", followSlide, true);

  return () => {
    clearChatScreen(doc);
    if (frame !== 0) cancel?.(frame);
    mutations.disconnect();
    resize?.disconnect();
    view?.removeEventListener("click", buzzTab, true);
    view?.removeEventListener("pointerup", buzzTab, true);
    view?.removeEventListener("click", buzzLauncher);
    view?.removeEventListener("touchstart", tabTouchStart, true);
    view?.removeEventListener("touchend", tabTouchEnd, true);
    view?.removeEventListener("touchcancel", tabTouchCancel, true);
    view?.removeEventListener("pointerdown", kick, true);
    view?.removeEventListener("pointermove", kick, true);
    view?.removeEventListener("pointerdown", downFinger, true);
    view?.removeEventListener("pointermove", moveFinger, true);
    view?.removeEventListener("pointerup", upFinger, true);
    view?.removeEventListener("pointercancel", upFinger, true);
    view?.removeEventListener("touchstart", downFinger, true);
    view?.removeEventListener("touchmove", moveFinger, true);
    view?.removeEventListener("touchend", upFinger, true);
    view?.removeEventListener("touchcancel", upFinger, true);
    view?.removeEventListener("wheel", kick, true);
    view?.removeEventListener("resize", kick);
    view?.removeEventListener("transitionrun", followSlide, true);
    view?.removeEventListener("transitionend", followSlide, true);
  };
}

function clearChatScreen(doc: Document): void {
  chatScreenPrimed = false;
  sidebarPhase = { side: "rest", closeSent: false };
  finger = null;
  heldHaptics = [];
  suppressHaptics = [];
  suppressUntil = 0;
  settleSuppress = null;
  settleLeft = false;
  confirmedSide = "rest";
  if (typeof doc.querySelector !== "function") return;
  const inset = doc.querySelector<HTMLElement>('[data-sidebar="inset"]');
  if (inset !== null) delete inset.dataset[SCREEN];
}

function snapshot(doc: Document): string {
  const left = Array.from(doc.querySelectorAll<HTMLElement>('[data-sidebar="panel"]'))
    .map((panel) => {
      const box = panel.getBoundingClientRect();
      return `${box.left}:${box.width}:${readSidebarDepth(doc, panel).toFixed(3)}`;
    })
    .join("|");
  const right = Array.from(doc.querySelectorAll<HTMLElement>(`${RIGHT_PANEL}, ${RIGHT_SHELF}`))
    .map((panel) => {
      const box = panel.getBoundingClientRect();
      const depth = readSidebarChrome(doc).device === "phone" && panel.matches(RIGHT_SHELF)
        ? readRightShelfDepth(doc, panel)
        : readRightDepth(panel);
      return `${box.left}:${box.width}:${depth.toFixed(3)}`;
    })
    .join("|");
  return `${left}#${right}`;
}

let chatScreenPrimed = false;
let sidebarPhase: SidebarPhase = { side: "rest", closeSent: false };
let finger: Finger | null = null;
let heldHaptics: SidebarHaptic[] = [];
let suppressHaptics: SidebarHaptic[] = [];
let suppressUntil = 0;
let settleSuppress: SidebarSide | null = null;
let settleLeft = false;
let confirmedSide: SidebarSide = "rest";

type Finger = {
  x: number;
  y: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
  target: EventTarget | null;
  pointerId: number | null;
  touchId: number | null;
};

function syncChatScreen(doc: Document): void {
  if (typeof doc.querySelector !== "function") return;
  const inset = doc.querySelector<HTMLElement>('[data-sidebar="inset"]');
  if (inset === null) return;
  if (prefersReducedMotion(doc)) {
    delete inset.dataset[SCREEN];
    sidebarPhase = { side: "rest", closeSent: false };
    settleSuppress = null;
    settleLeft = false;
    confirmedSide = "rest";
    return;
  }
  const sample = readScreenSample(doc, inset);
  applyChatScreen(inset, sample.translateX);
  if (!chatScreenPrimed) {
    chatScreenPrimed = true;
    sidebarPhase = { side: readSidebarSide(sample), closeSent: false };
    if (sample.sidebarShelf === "open") confirmedSide = "left";
    else if (sample.panelShelf === "shelf" || sample.panelShelf === "full") confirmedSide = "right";
    return;
  }
  const previousPhase = sidebarPhase;
  if (sample.sidebarShelf === "open") confirmedSide = "left";
  else if (sample.panelShelf === "shelf" || sample.panelShelf === "full") confirmedSide = "right";
  const step = nextSidebarPhase(previousPhase, sample);
  const earlyClose =
    step.phase.closeSent &&
    step.phase.side === previousPhase.side &&
    step.haptics.includes("close") &&
    confirmedSide !== step.phase.side;
  sidebarPhase = earlyClose ? { side: step.phase.side, closeSent: false } : step.phase;
  const haptics = earlyClose ? step.haptics.filter((haptic) => haptic !== "close") : step.haptics;
  if (sidebarPhase.side === "rest") confirmedSide = "rest";
  expireSuppress(eventNow(doc));
  if (settleSuppress !== null) {
    if (sidebarPhase.side !== settleSuppress) settleLeft = true;
    if (settleLeft && sidebarPhase.side === settleSuppress) {
      settleSuppress = null;
      settleLeft = false;
    }
    return;
  }
  const fresh = consumeSuppress(haptics);
  if (fresh.includes("open") && sidebarPhase.side === "left") blurComposerCaret(doc);
  if (finger !== null) {
    heldHaptics.push(...fresh);
    return;
  }
  if (fresh.length === 0) return;
  const native = readNativeBridge(doc);
  for (const haptic of fresh) {
    const side = haptic === "open" ? sidebarPhase.side : previousPhase.side;
    postSlideHaptic(native, slideHapticKind(side));
  }
}

function readScreenSample(doc: Document, inset: HTMLElement): {
  translateX: number;
  sidebarShelf: string | null;
  panelShelf: string | null;
} {
  const style = doc.defaultView?.getComputedStyle?.(inset) ?? {
    translate: inset.style.translate,
    transform: inset.style.transform,
  };
  const width = inset.getBoundingClientRect?.().width ?? 0;
  return {
    translateX: readTranslateX(style, width),
    sidebarShelf: inset.getAttribute("data-sidebar-shelf"),
    panelShelf: inset.getAttribute("data-panel-shelf"),
  };
}

function trackFingerDown(doc: Document, event: Event): void {
  if (!usesPhoneShelf(readSidebarChrome(doc)) || prefersReducedMotion(doc)) return;
  const point = eventPoint(event);
  if (point === null) return;
  if (event.type === "pointerdown" && point.button !== 0) return;
  if (finger !== null) {
    if (event.type === "pointerdown" && finger.touchId !== null && finger.pointerId === null) {
      finger.pointerId = point.pointerId;
    }
    return;
  }
  if (readReleaseTarget(event.target) === "other") return;
  finger = {
    x: point.x,
    y: point.y,
    lastX: point.x,
    lastTime: eventNow(doc),
    velocityX: 0,
    target: event.target,
    pointerId: point.pointerId,
    touchId: point.touchId,
  };
  heldHaptics = [];
}

function trackFingerMove(doc: Document, event: Event): void {
  if (finger === null) return;
  const point = eventPoint(event);
  if (point === null || !sameFinger(point)) return;
  const elapsed = eventNow(doc) - finger.lastTime;
  if (elapsed <= 0) return;
  finger.velocityX = ((point.x - finger.lastX) / elapsed) * 1000;
  finger.lastX = point.x;
  finger.lastTime = eventNow(doc);
}

function trackFingerUp(doc: Document, event: Event): void {
  if (finger === null) return;
  const point = eventPoint(event);
  if (point === null || !sameFinger(point)) return;
  const release: FingerRelease = {
    target: readReleaseTarget(finger.target),
    deltaX: point.x - finger.x,
    deltaY: point.y - finger.y,
    velocityX: finger.velocityX,
    width: releaseWidth(doc, finger.target),
  };
  const held = heldHaptics;
  finger = null;
  heldHaptics = [];
  if (!usesPhoneShelf(readSidebarChrome(doc)) || prefersReducedMotion(doc)) return;
  primeSidebarPhase(doc);
  const decision = sidebarFingerRelease(sidebarPhase, release, held);
  const now = eventNow(doc);
  if (decision.settle !== null) {
    settleSuppress = decision.settle;
    settleLeft = sidebarPhase.side !== decision.settle;
    suppressUntil = now + SUPPRESS_MS;
  }
  if (decision.suppress.length > 0) {
    suppressHaptics.push(...decision.suppress);
    suppressUntil = now + SUPPRESS_MS;
  }
  if (
    decision.haptics.includes("open") &&
    (release.target === "left-trigger" || release.target === "inset")
  ) {
    blurComposerCaret(doc);
  }
  if (decision.haptics.length === 0) return;
  const native = readNativeBridge(doc);
  const acted = fingerHapticSide(release.target);
  for (const haptic of decision.haptics) {
    const side = haptic === "close" && sidebarPhase.side !== "rest" && sidebarPhase.side !== acted
      ? sidebarPhase.side
      : acted;
    postSlideHaptic(native, slideHapticKind(side));
  }
}

function primeSidebarPhase(doc: Document): void {
  if (chatScreenPrimed || typeof doc.querySelector !== "function") return;
  const inset = doc.querySelector<HTMLElement>('[data-sidebar="inset"]');
  if (inset === null) return;
  chatScreenPrimed = true;
  sidebarPhase = { side: readSidebarSide(readScreenSample(doc, inset)), closeSent: false };
}

function releaseWidth(doc: Document, target: EventTarget | null): number {
  const kind = readReleaseTarget(target);
  const selector =
    kind === "right-shelf" || kind === "right-dismiss" || kind === "right-hide" ? RIGHT_SHELF : '[data-sidebar="panel"]';
  const width = doc.querySelector<HTMLElement>(selector)?.getBoundingClientRect?.().width ?? 0;
  return width > 0 ? width : 0;
}

function fingerHapticSide(target: ReleaseTarget): "left" | "right" {
  if (
    target === "left-trigger" ||
    target === "left-backdrop" ||
    target === "left-panel" ||
    target === "inset"
  ) {
    return "left";
  }
  return "right";
}

function consumeSuppress(haptics: SidebarHaptic[]): SidebarHaptic[] {
  const remain: SidebarHaptic[] = [];
  for (const haptic of haptics) {
    const index = suppressHaptics.indexOf(haptic);
    if (index >= 0) suppressHaptics.splice(index, 1);
    else remain.push(haptic);
  }
  return remain;
}

function expireSuppress(nowMs: number): void {
  if (suppressUntil <= 0 || nowMs <= suppressUntil) return;
  suppressHaptics = [];
  settleSuppress = null;
  settleLeft = false;
  suppressUntil = 0;
}

function eventNow(doc: Document): number {
  return doc.defaultView?.performance?.now?.() ?? Date.now();
}

function sameFinger(point: FingerPoint): boolean {
  if (finger === null) return false;
  if (point.touchId !== null) return finger.touchId === point.touchId;
  return point.pointerId !== null && finger.pointerId === point.pointerId;
}

type FingerPoint = { x: number; y: number; pointerId: number | null; touchId: number | null; button: number };

function eventPoint(event: Event): FingerPoint | null {
  const point = event as Event & {
    button?: number;
    pointerId?: number;
    clientX?: number;
    clientY?: number;
    touches?: ArrayLike<Touch>;
    changedTouches?: ArrayLike<Touch>;
  };
  if (event.type.startsWith("touch")) {
    const list = point.changedTouches ?? point.touches;
    const touch = list === undefined || list.length === 0 ? undefined : list[0];
    if (touch === undefined) return null;
    return { x: touch.clientX, y: touch.clientY, pointerId: null, touchId: touch.identifier, button: 0 };
  }
  if (typeof point.clientX !== "number" || typeof point.clientY !== "number") return null;
  return {
    x: point.clientX,
    y: point.clientY,
    pointerId: point.pointerId ?? null,
    touchId: null,
    button: point.button ?? 0,
  };
}

const MOTION_SHELL =
  '[data-sidebar="panel"], [data-sidebar="inset"], [data-sidebar="gap"], [data-panel-group], [data-panel], [data-testid="secondary-panel-shelf"]';

export function isSidebarMotionTarget(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (element === null) return false;
  if (element.matches(MOTION_SHELL)) return true;
  const parent = element.parentElement;
  return parent?.matches("[data-panel]") === true && element.tagName === "ASIDE";
}

function touchPoints(
  event: Event,
  key: "touches" | "changedTouches",
): ArrayLike<{ clientX: number; clientY: number }> | null {
  if (!(key in event)) return null;
  const points = (event as Event & Record<"touches" | "changedTouches", ArrayLike<{ clientX: number; clientY: number }> | undefined>)[key];
  return points ?? null;
}

function asElement(target: EventTarget | null): Element | null {
  if (target === null || typeof target !== "object" || !("closest" in target)) return null;
  if (typeof target.closest !== "function") return null;
  return target as Element;
}

function readNativeBridge(doc: Document): {
  post?: (message: unknown) => void;
  capabilities?: readonly string[];
} | null {
  const root = doc.defaultView as
    | (Window & { bb?: { native?: { post?: (message: unknown) => void; capabilities?: readonly string[] } } })
    | null;
  return root?.bb?.native ?? null;
}

function parseTranslateToken(token: string, referenceWidth: number): number {
  if (token.endsWith("%")) {
    const percent = Number.parseFloat(token);
    return Number.isFinite(percent) ? (percent / 100) * referenceWidth : 0;
  }
  return Number.parseFloat(token) || 0;
}

function prefersReducedMotion(doc: Document): boolean {
  return doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
