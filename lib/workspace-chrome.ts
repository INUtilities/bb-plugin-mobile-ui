import { addWorkspace, closeWorkspace, contentForRoute, decodeWorkspaces, normalizeOpenMode, listPanes, readNativeLayout, saveWorkspace, selectWorkspace, WORKSPACE_PREFERENCES_EVENT, type OpenMode, type WorkspaceSnapshot, type WorkspaceState } from "./workspaces.ts";
import type { Device } from "./device.ts";

const LAYOUT_KEY = "bb.splitLayout";
const MAXIMIZED_KEY = "bb.splitLayout.maximizedPaneId";
export const WORKSPACE_CHROME_CSS = `
[data-sidebar-workspaces] { display:flex; align-items:center; gap:4px; min-width:0; flex:1; height:36px; overflow-x:auto; scrollbar-width:none; -webkit-app-region:no-drag; }
[data-sidebar-workspace-tab] { display:flex; align-items:center; flex-shrink:0; border-radius:var(--radius-md, 6px); color:var(--muted-foreground); }
[data-sidebar-workspace-tab][data-active] { background:var(--sidebar-accent); color:var(--sidebar-accent-foreground); }
[data-sidebar-workspaces] button { border:0; background:transparent; color:inherit; font:inherit; font-size:12px; line-height:18px; padding:6px 10px; border-radius:var(--radius-md, 6px); cursor:pointer; -webkit-app-region:no-drag; }
[data-sidebar-workspaces] button:hover { background:color-mix(in oklab, var(--foreground) 6%, transparent); }
[data-sidebar-workspaces] button:focus-visible { outline:2px solid var(--ring); outline-offset:-2px; }
[data-sidebar-workspaces] button[data-workspace-close] { padding:4px 7px; }
[data-sidebar-workspaces] button:disabled { cursor:default; opacity:.3; }
[data-sidebar-workspaces] [role=status] { font-size:12px; color:var(--destructive); padding:0 8px; }
[data-sidebar-workspace-bar] { flex-shrink:0; padding:0 8px 6px; display:flex; align-items:center; }
:root:not([data-bb-sidebar-phone]) [data-app-content-shell] { padding:8px; }
:root:not([data-bb-sidebar-phone]) :is([data-sidebar="inset"], [data-app-content-shell]) { background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-sidebar="collapsible-body"] { margin:8px; border-radius:18px; overflow:clip; border-color:transparent; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] { padding:4px; isolation:isolate; border-color:transparent !important; background:transparent !important; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id]:not([data-focused]) { position:relative; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id]::before { content:""; position:absolute; inset:4px; z-index:-1; pointer-events:none; border-radius:18px; background:var(--sidebar); }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] > :is(div, section):not([data-pane-focus-scrim]) { border-radius:18px; overflow:clip; background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] > [data-pane-focus-scrim] { inset:4px; border-radius:18px; }
:root:not([data-bb-sidebar-phone]) [data-panel] > aside { isolation:isolate; border-radius:18px; border-color:transparent; background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-panel] > aside:not(:has([data-split-pane-id]))::before { content:""; position:absolute; inset:0; z-index:-1; pointer-events:none; border-radius:18px; background:var(--sidebar); }
/* 네이티브 바깥 표면만 비운다. 포커스 scrim과 내부 카드·입력·선택 색은 유지한다. */
:root:not([data-bb-sidebar-phone]) :is([data-split-pane-id], [data-panel] > aside) :is([data-thread-window], [data-pane-content], header:has(> [data-testid="app-page-header-content-row"])) { background:transparent; }
:root:not([data-bb-sidebar-phone]) :is([data-panel] > aside > div, [data-split-pane-id] > section) > div { background:transparent; }
:root:not([data-bb-sidebar-phone]) :is([data-split-pane-id], [data-panel] > aside) [data-bb-plugin-root]:not([data-thread-window] *) > :is(div, section, main),
:root:not([data-bb-sidebar-phone]) :is([data-split-pane-id], [data-panel] > aside) [data-bb-plugin-root]:not([data-thread-window] *) > :is(div, section, main) > header,
:root:not([data-bb-sidebar-phone]) :is([data-split-pane-id], [data-panel] > aside) [data-bb-plugin-root]:not([data-thread-window] *) > :is(div, section, main) > main > header { background:transparent; }
:root:not([data-bb-sidebar-phone]) [data-split-resize-grid-boundary] { background:transparent !important; }
`;
export interface WorkspaceChromeOptions {
  pluginId: string;
  device: Device;
  navigate?: (route: string) => void;
}

export function mountWorkspaceChrome(doc: Document, options: WorkspaceChromeOptions): () => void {
  const view = doc.defaultView;
  if (!view || options.device !== "desktop") return () => {};
  const key = `${options.pluginId}:workspaces:v1`;
  const read = (name: string): string | null => { try { return view.sessionStorage.getItem(name) ?? view.localStorage.getItem(name); } catch { return null; } };
  const route = (): string => view.location.hash.startsWith("#/") ? view.location.hash.slice(1) : view.location.pathname + view.location.search;
  const capture = (): WorkspaceSnapshot => ({ route: route(), layout: readNativeLayout(read(LAYOUT_KEY)), maximizedPaneId: read(MAXIMIZED_KEY) || null });
  let state: WorkspaceState = decodeWorkspaces(read(key), capture());
  let openMode: OpenMode = "new-pane";
  let disposed = false;
  let switching = false;
  let saved = "";
  const writeState = (): void => { const raw = JSON.stringify(state); if (raw === saved) return; try { view.sessionStorage.setItem(key, raw); saved = raw; } catch { /* 저장을 막은 창에서도 현재 세션의 탭은 유지한다. */ } };
  const checkpoint = (): void => { if (switching || disposed) return; state = saveWorkspace(state, capture()); writeState(); };
  const writeNative = (snapshot: WorkspaceSnapshot): void => {
    view.sessionStorage.setItem(LAYOUT_KEY, snapshot.layout === null ? "" : JSON.stringify({ version: 1, layout: snapshot.layout }));
    view.sessionStorage.setItem(MAXIMIZED_KEY, snapshot.maximizedPaneId ?? "");
  };
  const navigate = options.navigate ?? ((next: string) => {
    const target = new URL(view.location.href);
    if (target.hash.startsWith("#/")) target.hash = `#${next}`;
    else { const path = new URL(next, target.origin); target.pathname = path.pathname; target.search = path.search; target.hash = ""; }
    if (target.href === view.location.href) view.location.reload();
    else view.location.assign(target.href);
  });
  const restore = (): void => {
    const selected = state.tabs.find(tab => tab.id === state.activeId);
    if (!selected) return;
    try { switching = true; writeState(); writeNative(selected.snapshot); render(); navigate(selected.snapshot.route); }
    catch (error) { switching = false; showError(error); }
  };
  const style = doc.createElement("style"); style.dataset.sidebarWorkspaceStyle = ""; style.textContent = WORKSPACE_CHROME_CSS; doc.head.append(style);
  const bar = doc.createElement("div"); bar.dataset.sidebarWorkspaceBar = "";
  const nav = doc.createElement("nav"); nav.dataset.sidebarWorkspaces = ""; nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "워크스페이스"); bar.append(nav);
  const status = doc.createElement("span"); status.setAttribute("role", "status");
  const showError = (error: unknown): void => { status.textContent = error instanceof Error ? error.message : "워크스페이스를 복원하지 못했습니다."; nav.append(status); };
  const button = (label: string, action: () => void): HTMLButtonElement => { const b = doc.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = action; return b; };
  const render = (): void => {
    nav.replaceChildren();
    for (const tab of state.tabs) {
      const group = doc.createElement("div"); group.dataset.sidebarWorkspaceTab = tab.id;
      if (tab.id === state.activeId) group.dataset.active = "";
      const select = button(tab.name, () => { if (tab.id === state.activeId || switching) return; checkpoint(); state = selectWorkspace(state, tab.id); restore(); });
      select.setAttribute("role", "tab"); select.setAttribute("aria-selected", String(tab.id === state.activeId));
      const close = button("×", () => { if (switching) return; checkpoint(); const active = state.activeId; state = closeWorkspace(state, tab.id); writeState(); if (state.activeId !== active) restore(); else render(); });
      close.dataset.workspaceClose = ""; close.disabled = state.tabs.length === 1; close.setAttribute("aria-label", `${tab.name} 워크스페이스 닫기`); close.title = close.disabled ? "마지막 워크스페이스는 닫을 수 없습니다." : "워크스페이스 닫기";
      group.append(select, close); nav.append(group);
    }
    const add = button("＋", () => { if (switching) return; checkpoint(); state = addWorkspace(state, view.crypto.randomUUID()); restore(); });
    add.setAttribute("aria-label", "새 워크스페이스"); nav.append(add);
  };
  const ensureBar = (): void => {
    if (disposed) return;
    const titlebar = doc.querySelector('[data-testid="app-window-title-bar"]');
    const target = titlebar ?? doc.querySelector("[data-app-content-shell]");
    if (!target) return;
    if (titlebar) {
      const trailing = Array.from(titlebar.children).find(child => child.matches('[data-testid="window-right-panel-toggle"]') || child.querySelector('[data-testid="window-right-panel-toggle"]')) ?? null;
      if (bar.parentElement === titlebar && bar.nextElementSibling === trailing) return;
      bar.style.flex = "1"; bar.style.minWidth = "0"; bar.style.padding = "0 8px";
      titlebar.insertBefore(bar, trailing);
    } else {
      if (bar.parentElement === target) return;
      bar.style.flex = ""; bar.style.minWidth = ""; bar.style.padding = ""; target.prepend(bar);
    }
  };
  const onPreferences = (event: Event): void => {
    const detail: unknown = Reflect.get(event, "detail");
    if (detail === null || typeof detail !== "object" || Reflect.get(detail, "pluginId") !== options.pluginId) return;
    openMode = normalizeOpenMode(Reflect.get(detail, "openMode"));
  };
  const onClick = (event: MouseEvent): void => {
    if (openMode !== "new-pane" || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || switching) return;
    const element = event.target instanceof view.Element ? event.target : null;
    if (!element || element.closest("[data-sidebar-workspaces]")) return;
    const thread = element.closest("a[data-sidebar-thread-id]");
    const ribbon = element.closest('nav[aria-label="Primary navigation"] button:not([aria-haspopup])');
    const label = ribbon?.getAttribute("aria-label") ?? "";
    const ribbonPage = ribbon && label !== "Home" && !label.startsWith("Search threads") && !label.startsWith("Settings");
    const sidebarLink = element.closest<HTMLAnchorElement>('[data-sidebar="sidebar"] a[href]');
    const internalLink = sidebarLink && !sidebarLink.hasAttribute("download") && (!sidebarLink.target || sidebarLink.target === "_self") && sidebarLink.origin === view.location.origin && contentForRoute(sidebarLink.pathname);
    const createThread = element.closest('[data-sidebar="sidebar"] button[aria-label^="New thread"]');
    if (!thread && !ribbonPage && !internalLink && !createThread) return;
    checkpoint();
    const layout = capture().layout;
    // 빈 워크스페이스의 첫 화면은 기본 compose 자리를 채운다.
    if (route() === "/" && layout?.root.type === "pane" && layout.root.content.kind === "new-thread") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (layout && listPanes(layout.root).length >= 8) {
      showError(new Error("BB는 최대 8개 페인을 지원합니다. 페인을 닫거나 열기 방식을 교체로 바꿔 주세요."));
      return;
    }
    // BB의 리본·스레드 행이 제공하는 modifier-click 분할 경로를 그대로 호출한다.
    // 저장소를 직접 바꾸거나 문서를 재로드하지 않아 기존 페인을 유지한다.
    element.dispatchEvent(new view.MouseEvent("click", {
      bubbles: true, cancelable: true, composed: true, view, metaKey: true,
      button: event.button, buttons: event.buttons, detail: event.detail,
      clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
    }));
  };
  doc.addEventListener("click", onClick, true);
  view.addEventListener(WORKSPACE_PREFERENCES_EVENT, onPreferences);
  view.addEventListener("beforeunload", checkpoint);
  const tick = view.setInterval(() => { ensureBar(); checkpoint(); }, 500);
  render(); ensureBar(); checkpoint();
  return () => {
    checkpoint(); disposed = true;
    view.clearInterval(tick);
    doc.removeEventListener("click", onClick, true);
    view.removeEventListener(WORKSPACE_PREFERENCES_EVENT, onPreferences);
    view.removeEventListener("beforeunload", checkpoint);
    bar.remove(); style.remove();
  };
}
