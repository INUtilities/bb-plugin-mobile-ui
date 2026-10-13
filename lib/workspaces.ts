export const WORKSPACE_OPEN_MODE_SETTING = "openMode";
export const WORKSPACE_PREFERENCES_CHANNEL = "workspace-preferences";
export const WORKSPACE_PREFERENCES_EVENT = "bb-sidebar-workspace-preferences";
export type OpenMode = "new-pane" | "replace";
export type PaneContent =
  | { kind: "thread"; projectId: string; threadId: string }
  | { kind: "new-thread" }
  | { kind: "plugin-panel"; pluginId: string; panelPath: string; subPath: string }
  | { kind: "plugin-detail"; pluginId: string };
export type LayoutNode =
  | { type: "pane"; paneId: string; content: PaneContent }
  | { type: "split"; dir: "row" | "col"; sizes: number[]; children: LayoutNode[] };
export interface NativeLayout { root: LayoutNode; focusedPaneId: string }
export interface WorkspaceSnapshot { route: string; layout: NativeLayout | null; maximizedPaneId: string | null }
export interface WorkspaceTab { id: string; name: string; snapshot: WorkspaceSnapshot }
export interface WorkspaceState { version: 1; activeId: string; nextNumber: number; tabs: WorkspaceTab[] }

export function normalizeOpenMode(value: unknown): OpenMode { return value === "replace" ? "replace" : "new-pane"; }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
export function safeRoute(route: unknown): route is string { return typeof route === "string" && route.startsWith("/") && !route.startsWith("//") && !/[\r\n\\]/.test(route); }
function validContent(value: unknown): value is PaneContent {
  if (!object(value)) return false;
  switch (value.kind) {
    case "thread": return text(value.projectId) && text(value.threadId);
    case "new-thread": return true;
    case "plugin-panel": return text(value.pluginId) && text(value.panelPath) && typeof value.subPath === "string";
    case "plugin-detail": return text(value.pluginId);
    default: return false;
  }
}
function validNode(value: unknown, ids: string[], depth = 0): value is LayoutNode {
  if (!object(value) || depth > 16 || ids.length > 8) return false;
  if (value.type === "pane") {
    if (!text(value.paneId) || !validContent(value.content) || ids.includes(value.paneId)) return false;
    ids.push(value.paneId); return ids.length <= 8;
  }
  if (value.type !== "split" || !["row", "col"].includes(String(value.dir)) || !Array.isArray(value.sizes) || !Array.isArray(value.children)) return false;
  if (value.children.length < 2 || value.children.length > 8 || value.children.length !== value.sizes.length) return false;
  if (!value.sizes.every(size => typeof size === "number" && Number.isFinite(size) && size > 0)) return false;
  if (Math.abs(value.sizes.reduce((sum: number, size: number) => sum + size, 0) - 1) > 1e-9) return false;
  return value.children.every(child => validNode(child, ids, depth + 1));
}
function validLayout(value: unknown): value is NativeLayout {
  if (!object(value) || !text(value.focusedPaneId)) return false;
  const ids: string[] = [];
  return validNode(value.root, ids) && ids.includes(value.focusedPaneId);
}
export function readNativeLayout(raw: string | null): NativeLayout | null {
  if (raw === null || raw === "") return null;
  try { const parsed: unknown = JSON.parse(raw); return object(parsed) && parsed.version === 1 && validLayout(parsed.layout) ? parsed.layout : null; } catch { return null; }
}
export function contentForRoute(route: string): PaneContent | null {
  if (!safeRoute(route)) return null;
  const path = route.split(/[?#]/)[0];
  if (path === "/") return { kind: "new-thread" };
  const thread = path.match(/^\/projects\/([^/]+)\/threads\/([^/]+)\/?$/);
  if (thread) return { kind: "thread", projectId: thread[1], threadId: thread[2] };
  const plugin = path.match(/^\/plugins\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
  if (plugin) return { kind: "plugin-panel", pluginId: plugin[1], panelPath: plugin[2], subPath: plugin[3] ?? "" };
  return null;
}
export function createWorkspaces(snapshot: WorkspaceSnapshot): WorkspaceState { return { version: 1, activeId: "default", nextNumber: 1, tabs: [{ id: "default", name: "기본", snapshot: structuredClone(snapshot) }] }; }
export function saveWorkspace(state: WorkspaceState, snapshot: WorkspaceSnapshot): WorkspaceState { return { ...state, tabs: state.tabs.map(tab => tab.id === state.activeId ? { ...tab, snapshot: structuredClone(snapshot) } : tab) }; }
export function addWorkspace(state: WorkspaceState, id: string): WorkspaceState { return { ...state, activeId: id, nextNumber: state.nextNumber + 1, tabs: [...state.tabs, { id, name: `작업 ${state.nextNumber}`, snapshot: { route: "/", layout: null, maximizedPaneId: null } }] }; }
export function selectWorkspace(state: WorkspaceState, id: string): WorkspaceState { return state.tabs.some(tab => tab.id === id) ? { ...state, activeId: id } : state; }
export function closeWorkspace(state: WorkspaceState, id: string): WorkspaceState {
  if (state.tabs.length === 1) return state;
  const index = state.tabs.findIndex(tab => tab.id === id);
  if (index === -1) return state;
  const tabs = state.tabs.filter(tab => tab.id !== id);
  return { ...state, tabs, activeId: state.activeId === id ? tabs[Math.min(index, tabs.length - 1)].id : state.activeId };
}
export function decodeWorkspaces(raw: string | null, fallback: WorkspaceSnapshot): WorkspaceState {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (!object(parsed) || parsed.version !== 1 || !text(parsed.activeId) || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0 || parsed.tabs.length > 128) return createWorkspaces(fallback);
    const tabs: WorkspaceTab[] = [];
    for (const value of parsed.tabs) {
      if (!object(value) || !text(value.id) || !text(value.name) || !object(value.snapshot) || !safeRoute(value.snapshot.route) || tabs.some(tab => tab.id === value.id)) return createWorkspaces(fallback);
      const layout = value.snapshot.layout;
      if (layout !== null && !validLayout(layout)) return createWorkspaces(fallback);
      tabs.push({ id: value.id, name: value.name, snapshot: { route: value.snapshot.route, layout, maximizedPaneId: typeof value.snapshot.maximizedPaneId === "string" ? value.snapshot.maximizedPaneId : null } });
    }
    if (!tabs.some(tab => tab.id === parsed.activeId)) return createWorkspaces(fallback);
    return { version: 1, activeId: parsed.activeId, nextNumber: typeof parsed.nextNumber === "number" && Number.isSafeInteger(parsed.nextNumber) && parsed.nextNumber > 0 ? parsed.nextNumber : tabs.length, tabs };
  } catch { return createWorkspaces(fallback); }
}
export function listPanes(node: LayoutNode): Extract<LayoutNode, { type: "pane" }>[] { return node.type === "pane" ? [node] : node.children.flatMap(listPanes); }
function replaceNode(node: LayoutNode, id: string, replacement: LayoutNode): LayoutNode { return node.type === "pane" ? node.paneId === id ? replacement : node : { ...node, children: node.children.map(child => replaceNode(child, id, replacement)) }; }
export function openPane(snapshot: WorkspaceSnapshot, content: PaneContent, route: string, mode: OpenMode, id: string): WorkspaceSnapshot {
  const pane: LayoutNode = { type: "pane", paneId: id, content };
  const initial = contentForRoute(snapshot.route);
  const layout = snapshot.layout ?? (initial ? { root: { type: "pane" as const, paneId: `${id}-previous`, content: initial }, focusedPaneId: `${id}-previous` } : null);
  if (layout === null || (layout.root.type === "pane" && layout.root.content.kind === "new-thread" && snapshot.route === "/")) return { route, layout: { root: pane, focusedPaneId: id }, maximizedPaneId: null };
  if (mode === "replace") return { ...snapshot, route, layout: { ...layout, root: replaceNode(layout.root, layout.focusedPaneId, { ...pane, paneId: layout.focusedPaneId }) } };
  if (listPanes(layout.root).length >= 8) throw new Error("BB는 최대 8개 페인을 지원합니다. 페인을 닫거나 열기 방식을 교체로 바꿔 주세요.");
  const focused = listPanes(layout.root).find(pane => pane.paneId === layout.focusedPaneId);
  if (!focused) throw new Error("활성 페인을 찾을 수 없습니다.");
  const root = replaceNode(layout.root, focused.paneId, { type: "split", dir: "row", sizes: [0.5, 0.5], children: [focused, pane] });
  return { route, layout: { root, focusedPaneId: id }, maximizedPaneId: null };
}
