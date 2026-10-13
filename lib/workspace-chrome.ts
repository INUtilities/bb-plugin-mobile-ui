import { addWorkspace, closeWorkspace, contentForRoute, decodeWorkspaces, normalizeOpenMode, openPane, readNativeLayout, saveWorkspace, selectWorkspace, WORKSPACE_PREFERENCES_EVENT, type OpenMode, type WorkspaceSnapshot, type WorkspaceState } from "./workspaces.ts";
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
:root:not([data-bb-sidebar-phone]) [data-sidebar="collapsible-body"] { margin:8px; border-radius:18px; overflow:clip; border-color:transparent; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] { padding:4px; border-color:transparent !important; background:transparent !important; }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] > :is(div, section):not([data-pane-focus-scrim]) { border-radius:18px; overflow:clip; background:var(--background); }
:root:not([data-bb-sidebar-phone]) [data-split-pane-id] > [data-pane-focus-scrim] { inset:4px; border-radius:18px; }
:root:not([data-bb-sidebar-phone]) [data-panel] > aside { border-radius:18px; border-color:transparent; }
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
  let pendingOpen: WorkspaceSnapshot | null = null;
  let pendingUntil = 0;
  let timer: number | undefined;
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
    if (!target || bar.parentElement === target) return;
    if (titlebar) { bar.style.flex = "1"; bar.style.minWidth = "0"; bar.style.padding = "0 8px"; target.append(bar); }
    else { bar.style.flex = ""; bar.style.minWidth = ""; bar.style.padding = ""; target.prepend(bar); }
  };
  const onPreferences = (event: Event): void => {
    const detail: unknown = Reflect.get(event, "detail");
    if (detail === null || typeof detail !== "object" || Reflect.get(detail, "pluginId") !== options.pluginId) return;
    openMode = normalizeOpenMode(Reflect.get(detail, "openMode"));
  };
  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || switching) return;
    const element = event.target instanceof view.Element ? event.target : null;
    if (!element || element.closest("[data-sidebar-workspaces]")) return;
    const thread = element.closest("[data-sidebar-thread-id]");
    const ribbon = element.closest('nav[aria-label="Primary navigation"]');
    const sidebarLink = element.closest('[data-sidebar="sidebar"] a[href]');
    const createThread = element.closest('[data-sidebar="sidebar"] button[aria-label^="New thread"]');
    if (!thread && !ribbon && !sidebarLink && !createThread) return;
    pendingOpen = capture(); pendingUntil = Date.now() + 5000; checkpoint();
    if (timer !== undefined) view.clearTimeout(timer);
    timer = view.setTimeout(processNavigation, 80);
  };
  const processNavigation = (): void => {
    if (!pendingOpen || disposed || switching) return;
    const before = pendingOpen;
    const nextRoute = route();
    if (nextRoute === before.route) { if (Date.now() > pendingUntil) pendingOpen = null; return; }
    pendingOpen = null;
    const content = contentForRoute(nextRoute);
    if (!content) { checkpoint(); return; }
    // 네이티브 저장소는 읽기 시에만 복원하므로 앱 재초기화 경계를 사용한다.
    try { const next = openPane(before, content, nextRoute, openMode, view.crypto.randomUUID()); state = saveWorkspace(state, next); restore(); }
    catch (error) { showError(error); }
  };
  const push = view.history.pushState;
  const replace = view.history.replaceState;
  const wrappedPush: History["pushState"] = function (...args) { push.apply(view.history, args); if (pendingOpen) { if (timer !== undefined) view.clearTimeout(timer); timer = view.setTimeout(processNavigation, 80); } };
  const wrappedReplace: History["replaceState"] = function (...args) { replace.apply(view.history, args); if (pendingOpen) { if (timer !== undefined) view.clearTimeout(timer); timer = view.setTimeout(processNavigation, 80); } };
  view.history.pushState = wrappedPush; view.history.replaceState = wrappedReplace;
  doc.addEventListener("click", onClick, true);
  view.addEventListener(WORKSPACE_PREFERENCES_EVENT, onPreferences);
  view.addEventListener("beforeunload", checkpoint);
  const tick = view.setInterval(() => { ensureBar(); if (pendingOpen) processNavigation(); else checkpoint(); }, 500);
  render(); ensureBar(); checkpoint();
  return () => {
    checkpoint(); disposed = true;
    view.clearInterval(tick); if (timer !== undefined) view.clearTimeout(timer);
    doc.removeEventListener("click", onClick, true);
    view.removeEventListener(WORKSPACE_PREFERENCES_EVENT, onPreferences);
    view.removeEventListener("beforeunload", checkpoint);
    if (view.history.pushState === wrappedPush) view.history.pushState = push;
    if (view.history.replaceState === wrappedReplace) view.history.replaceState = replace;
    bar.remove(); style.remove();
  };
}
