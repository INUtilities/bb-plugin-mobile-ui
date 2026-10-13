import { listPanes, readNativeLayout, type NativeLayout } from "./workspaces.ts";

// BB가 드래그를 확정한 뒤 만드는 ghost의 수명에 맞춰 원래 DOM을 잠시 가린다.
// 페인 이동·드롭 판정과 콘텐츠 마운트는 네이티브 BB가 계속 소유한다.
export function mountPaneDragPlaceholders(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) return () => {};
  const placeholders = new Map<HTMLElement, HTMLElement>();
  let armed = false;
  const style = doc.createElement("style");
  style.dataset.sidebarPaneDragStyle = "";
  style.textContent = `
[data-sidebar-drag-pane] > :not([data-sidebar-pane-placeholder]),
[data-sidebar-drag-pane] > :not([data-sidebar-pane-placeholder]) * { visibility:hidden !important; }
[data-sidebar-drag-pane] > [data-sidebar-pane-placeholder] { position:absolute; inset:4px; z-index:60; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:24px; border-radius:18px; background:var(--sidebar); color:var(--muted-foreground); pointer-events:none; }
[data-sidebar-pane-placeholder-icon] { width:32px; height:32px; flex-shrink:0; }
[data-sidebar-pane-placeholder-icon] > :is(svg, span, img) { width:32px !important; height:32px !important; }
[data-sidebar-pane-placeholder-title] { max-width:100%; font-size:14px; line-height:1.5; text-align:center; overflow-wrap:anywhere; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
`;
  doc.head.append(style);

  const fallbackIcon = (chat: boolean): SVGElement => {
    const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.5");
    icon.setAttribute("stroke-linejoin", "round");
    const path = doc.createElementNS(icon.namespaceURI, "path");
    path.setAttribute("d", chat ? "M5 4h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8l-5 3V6a2 2 0 0 1 2-2Z" : "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM3 9h18");
    icon.append(path);
    return icon;
  };
  const show = (): void => {
    let layout: NativeLayout | null = null;
    try { layout = readNativeLayout(view.sessionStorage.getItem("bb.splitLayout") ?? view.localStorage.getItem("bb.splitLayout")); } catch { /* 저장소가 차단된 창에서는 기본 아이콘을 쓴다. */ }
    const contents = new Map(layout ? listPanes(layout.root).map(pane => [pane.paneId, pane.content]) : []);
    const providers = new Map(Array.from(doc.querySelectorAll('[data-sidebar-thread-provider]'), node => [node.getAttribute('data-sidebar-thread-provider'), node.firstElementChild]));
    for (const pane of Array.from(doc.querySelectorAll<HTMLElement>('[data-split-pane-id], [data-panel] > aside:not(:has([data-split-pane-id]))'))) {
      const placeholder = doc.createElement("div");
      placeholder.dataset.sidebarPanePlaceholder = "";
      placeholder.setAttribute("aria-hidden", "true");
      const headerIcon = pane.querySelector('[data-testid="app-page-header-content-row"] .cursor-grab [data-icon-root], [data-testid="secondary-panel-tab-strip"] [aria-pressed="true"] [data-icon-root]');
      const content = contents.get(pane.dataset.splitPaneId ?? "");
      const chat = content?.kind === "thread" || !!pane.querySelector('[data-thread-window]') || (!headerIcon && !pane.closest('aside'));
      const providerIcon = content?.kind === "thread" ? providers.get(content.threadId) : null;
      const icon = doc.createElement("div"); icon.dataset.sidebarPanePlaceholderIcon = "";
      icon.append(chat ? providerIcon?.cloneNode(true) ?? fallbackIcon(true) : headerIcon?.cloneNode(true) ?? fallbackIcon(false));
      placeholder.append(icon);
      const title = chat ? pane.querySelector('[data-testid="app-page-header-content-row"] .cursor-grab')?.textContent?.trim() : null;
      if (title) {
        const label = doc.createElement("div"); label.dataset.sidebarPanePlaceholderTitle = ""; label.textContent = title;
        placeholder.append(label);
      }
      pane.dataset.sidebarDragPane = "";
      pane.append(placeholder);
      placeholders.set(pane, placeholder);
    }
  };
  const finish = (): void => {
    armed = false;
    observer.disconnect();
    for (const [pane, placeholder] of placeholders) {
      placeholder.remove();
      delete pane.dataset.sidebarDragPane;
    }
    placeholders.clear();
  };
  const observer = new view.MutationObserver(() => {
    if (!armed) return;
    if (doc.querySelector('[data-split-drag-ghost]')) {
      if (placeholders.size === 0) show();
    } else if (placeholders.size > 0) finish();
  });
  const onPointerDown = (event: PointerEvent): void => {
    finish();
    if (event.button !== 0 || !(event.target instanceof view.Element)) return;
    const handle = event.target.closest('[data-testid="app-page-header-content-row"] .cursor-grab');
    if (!handle?.closest('[data-split-pane-id]') || event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
    armed = true;
    // ghost는 body 바로 아래에 추가된다. 스트리밍 본문의 변경은 관찰하지 않는다.
    observer.observe(doc.body, { childList: true });
  };
  const onKeyDown = (event: KeyboardEvent): void => { if (event.key === "Escape" || event.code === "Escape") finish(); };
  const onVisibility = (): void => { if (doc.visibilityState === "hidden") finish(); };
  doc.addEventListener("pointerdown", onPointerDown, true);
  view.addEventListener("pointerup", finish, true);
  view.addEventListener("pointercancel", finish, true);
  view.addEventListener("keydown", onKeyDown, true);
  view.addEventListener("blur", finish);
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    finish(); style.remove();
    doc.removeEventListener("pointerdown", onPointerDown, true);
    view.removeEventListener("pointerup", finish, true);
    view.removeEventListener("pointercancel", finish, true);
    view.removeEventListener("keydown", onKeyDown, true);
    view.removeEventListener("blur", finish);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
