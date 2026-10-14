import type { Device } from "./device.ts";
import { EASE } from "./motion.ts";
const SLIDE_MS = 320;
export const SIDEBAR_CARDS_CSS = `
/* 왼쪽은 표준 곡선으로 화면을 밀고, 오른쪽은 기존 감속을 유지한다. */
:root:not([data-bb-sidebar-phone]) [data-sidebar="gap"] { transition:width ${SLIDE_MS}ms ${EASE.exit}; }
:root:not([data-bb-sidebar-phone]) [data-sidebar="panel"] { transition:left ${SLIDE_MS}ms ${EASE.exit}, right ${SLIDE_MS}ms ${EASE.exit}, width ${SLIDE_MS}ms ${EASE.exit}, visibility 0s linear 0s; }
:root:not([data-bb-sidebar-phone]) [data-collapsible="offcanvas"] > [data-sidebar="panel"] { transition-delay:0s, 0s, 0s, ${SLIDE_MS}ms; }
:root:not([data-bb-sidebar-phone]) [data-collapsible="rail"] [data-sidebar="collapsible-body"] { transition:visibility 0s linear ${SLIDE_MS}ms; }
:root:not([data-bb-sidebar-phone]) [data-split-resize-grid-root][data-panel-group] { --panel-collapse-duration:${SLIDE_MS}ms !important; }
:root:not([data-bb-sidebar-phone]) [data-split-resize-grid-root][data-panel-group] > :is([data-panel], [data-panel-resize-handle-id]) { transition-timing-function:${EASE.out}; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] { transition:none !important; }
:root:not([data-bb-sidebar-phone]) [data-testid="app-layout-root"][data-framed] { --bb-window-frame-lip:0px; --bb-window-frame-top:calc(var(--bb-app-chrome-row-height) + var(--bb-multipanes-frame-offset, 0px)); padding-top:var(--bb-window-frame-top); }
:root:not([data-bb-sidebar-phone]) [data-app-content-shell] { padding:0 4px 4px 0; }
/* 접힌 사이드바 옆 최외곽만 넓혀 중첩된 페인 사이의 여백은 유지한다. */
:root:not([data-bb-sidebar-phone]) [data-collapsible="rail"] ~ [data-sidebar="inset"] [data-app-content-shell] > main:has([data-split-pane-id]) { margin-left:-4px; }
:root:not([data-bb-sidebar-phone]) :is([data-sidebar="inset"], [data-app-content-shell]) { background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-sidebar="inset"] { border-block-width:0; border-inline-end-width:0; }
:root:not([data-bb-sidebar-phone]) [data-collapsible="rail"] ~ [data-sidebar="inset"] { border-inline-start-width:0; }
:root:not([data-bb-sidebar-phone]) [data-sidebar="collapsible-body"] { margin:calc(4px + var(--bb-multipanes-web-offset, 0px)) 4px 8px 0; overflow:clip; border-color:transparent; background:var(--sidebar); }
/* 목록을 푸터의 상단 여백까지 이어 붙인다. native 푸터 행과 리본 버튼 위치는 유지한다. */
:root:not([data-bb-sidebar-phone]) [data-sidebar="collapsible-body"]:not(:has([data-sidebar="footer"])) { margin-bottom:calc(-4px - var(--bb-multipanes-web-offset, 0px)); border-radius:18px 18px 0 0; }
:root:not([data-bb-sidebar-phone]) [data-sidebar="collapsible-body"]:has([data-sidebar="footer"]) { border-radius:0 0 18px 18px; }
/* 본문·푸터는 같은 고정 위치에 두고 바깥 clip과 화면만 전환한다. */
:root:not([data-bb-sidebar-phone]) [data-sidebar="panel"] { --sidebar-slide-width:calc(var(--sidebar-width) - var(--sidebar-rail-width, 0px) - 4px); }
:root:not([data-bb-sidebar-phone]) [data-sidebar="collapsible-body"] > div { left:0; right:auto; width:var(--sidebar-slide-width) !important; max-width:none; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] { padding:4px; isolation:isolate; border-color:transparent !important; background:transparent !important; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id]:not([data-focused]) { position:relative; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id]::before { content:""; position:absolute; inset:4px; z-index:-1; pointer-events:none; border-radius:18px; background:var(--sidebar); }
@media (prefers-reduced-motion: reduce) {
  :root:not([data-bb-sidebar-phone]) :is([data-sidebar="gap"], [data-sidebar="panel"], [data-sidebar="collapsible-body"], [data-sidebar="inset"], [data-split-resize-grid-root] > [data-panel], [data-split-resize-grid-root] > [data-panel-resize-handle-id]) { transition:none !important; }
  :root:not([data-bb-sidebar-phone]) [data-split-resize-grid-root][data-panel-group] { --panel-collapse-duration:0ms !important; }
}
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] [data-pane-header-focus-tab] { background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] > :is(div, section):not([data-pane-focus-scrim], [data-multipanes-pane-placeholder]) { border-radius:18px; overflow:clip; background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] > [data-pane-focus-scrim] { inset:4px; border-radius:18px; }
:root:not([data-bb-sidebar-phone]) [data-panel] > aside { isolation:isolate; border-radius:18px; border-color:transparent; background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-panel] > aside:not(:has([data-split-pane-id])) { padding:4px; }
:root:not([data-bb-sidebar-phone]) [data-panel] > aside:not(:has([data-split-pane-id]))::before { content:""; position:absolute; inset:4px; z-index:-1; pointer-events:none; border-radius:18px; background:var(--sidebar); }
/* 네이티브 바깥 표면만 비운다. 포커스 scrim과 내부 카드·입력·선택 색은 유지한다. */
:root:not([data-bb-sidebar-phone]) :is([data-split-pane-id], [data-panel] > aside) :is([data-thread-window], [data-pane-content], header:has(> [data-testid="app-page-header-content-row"])) { background:transparent; }
:root:not([data-bb-sidebar-phone]) :is([data-panel] > aside > div, [data-split-pane-id] > section) > div { background:transparent; }
:root:not([data-bb-sidebar-phone]) :is([data-split-pane-id], [data-panel] > aside) [data-bb-plugin-root]:not([data-thread-window] *) > :is(div, section, main),
:root:not([data-bb-sidebar-phone]) :is([data-split-pane-id], [data-panel] > aside) [data-bb-plugin-root]:not([data-thread-window] *) > :is(div, section, main) > header,
:root:not([data-bb-sidebar-phone]) :is([data-split-pane-id], [data-panel] > aside) [data-bb-plugin-root]:not([data-thread-window] *) > :is(div, section, main) > main > header { background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-split-resize-grid-boundary] { background:transparent !important; }`;
const mounted = new WeakMap<Document, { count: number; dispose: () => void }>();
export function mountSidebarCards(doc: Document, options: { device: Device }): () => void {
  if (options.device !== "desktop") return () => {};
  let entry = mounted.get(doc);
  if (!entry) {
    const style = doc.createElement("style");
    style.dataset.sidebarCardsStyle = "";
    style.textContent = SIDEBAR_CARDS_CSS;
    doc.head.append(style);
    entry = { count: 0, dispose: () => style.remove() };
    mounted.set(doc, entry);
  }
  entry.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry.count === 0) { entry.dispose(); mounted.delete(doc); }
  };
}
