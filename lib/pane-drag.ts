import { listPanes, readNativeLayout, type NativeLayout } from "./workspaces.ts";

// 네이티브 드래그·사이드바 전환 중 원래 DOM을 유지한 채 플레이스홀더를 표시한다.
export function mountPaneDragPlaceholders(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) return () => {};
  const placeholders = new Map<HTMLElement, HTMLElement>();
  const frozen = new Map<HTMLElement, { size: string; priority: string }>();
  const transitions = new Map<Element, Set<string>>();
  let armed = false;
  let dragging = false;
  let moving = false;
  let watchdog: number | undefined;
  let settleTimer: number | undefined;
  const style = doc.createElement("style");
  style.dataset.sidebarPaneDragStyle = "";
  style.textContent = `
[data-sidebar-drag-pane] > :not([data-sidebar-pane-placeholder]),
[data-sidebar-drag-pane] > :not([data-sidebar-pane-placeholder]) * { visibility:hidden !important; }
[data-sidebar-motion-pane] > :not([data-sidebar-pane-placeholder]) { content-visibility:hidden !important; contain-intrinsic-size:var(--sidebar-placeholder-size); }
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
      if (moving) {
        // 시작 시 한 번만 크기를 읽는다. 전환 중에는 숨긴 본문을 측정하지 않는다.
        for (const child of Array.from(pane.children)) {
          if (!(child instanceof view.HTMLElement) || child.hasAttribute('data-sidebar-pane-placeholder') || frozen.has(child)) continue;
          const rect = child.getBoundingClientRect();
          frozen.set(child, { size:child.style.getPropertyValue('--sidebar-placeholder-size'), priority:child.style.getPropertyPriority('--sidebar-placeholder-size') });
          child.style.setProperty('--sidebar-placeholder-size', `${rect.width}px ${rect.height}px`);
        }
        pane.dataset.sidebarMotionPane = '';
      }
      if (placeholders.has(pane)) continue;
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
      const title = chat ? pane.querySelector('[data-testid="app-page-header-content-row"] :is(.cursor-grab, .bb-thread-title)')?.textContent?.trim() : null;
      if (title) {
        const label = doc.createElement("div"); label.dataset.sidebarPanePlaceholderTitle = ""; label.textContent = title;
        placeholder.append(label);
      }
      pane.dataset.sidebarDragPane = "";
      pane.append(placeholder);
      placeholders.set(pane, placeholder);
    }
  };
  const clearIfIdle = (): void => {
    if (dragging || moving) return;
    for (const [pane, placeholder] of placeholders) {
      placeholder.remove();
      delete pane.dataset.sidebarDragPane;
    }
    placeholders.clear();
  };
  const finishDrag = (): void => {
    armed = false; dragging = false; observer.disconnect(); clearIfIdle();
  };
  const finishMotion = (): void => {
    view.clearTimeout(watchdog); view.clearTimeout(settleTimer);
    transitions.clear(); moving = false;
    for (const pane of placeholders.keys()) delete pane.dataset.sidebarMotionPane;
    for (const [child, old] of frozen) {
      if (old.size) child.style.setProperty('--sidebar-placeholder-size', old.size, old.priority);
      else child.style.removeProperty('--sidebar-placeholder-size');
    }
    frozen.clear(); clearIfIdle();
  };
  const finish = (): void => { finishMotion(); finishDrag(); };
  const startMotion = (): void => {
    if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    view.clearTimeout(settleTimer); view.clearTimeout(watchdog);
    moving = true; show();
    // 종료 이벤트 누락이나 호스트 재마운트가 있어도 본문을 계속 가리지 않는다.
    watchdog = view.setTimeout(finishMotion, 1000);
  };
  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.defaultPrevented || !(event.target instanceof view.Element)) return;
    if (event.target.closest('button[aria-label^="Toggle sidebar"], button[aria-label^="Show right panel"], button[aria-label^="Hide right panel"], button[data-testid="window-right-panel-toggle"]')) startMotion();
  };
  const onTransition = (event: TransitionEvent): void => {
    const target = event.target;
    if (!(target instanceof view.Element) || event.pseudoElement) return;
    const left = target.matches('[data-sidebar="gap"]') && event.propertyName === 'width';
    const right = target.matches('[data-panel]') && target.parentElement?.matches('[data-split-resize-grid-root][data-panel-group]') && !target.closest('[data-split-pane-id]') && ['flex-grow', 'flex-basis'].includes(event.propertyName);
    if (!left && !right) return;
    if (event.type === 'transitionrun') {
      startMotion();
      if (!moving) return;
      const properties = transitions.get(target) ?? new Set<string>();
      properties.add(event.propertyName); transitions.set(target, properties);
    } else if (moving) {
      const properties = transitions.get(target);
      properties?.delete(event.propertyName);
      if (!properties?.size) transitions.delete(target);
      // 역방향 전환의 cancel → run이 같은 프레임에 이어져도 깜박이지 않는다.
      if (transitions.size === 0) settleTimer = view.setTimeout(finishMotion, 0);
    }
  };
  const observer = new view.MutationObserver(() => {
    if (!armed) return;
    if (doc.querySelector('[data-split-drag-ghost]')) {
      dragging = true; show();
    } else if (dragging) finishDrag();
  });
  const onPointerDown = (event: PointerEvent): void => {
    finishDrag();
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
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("transitionrun", onTransition, true);
  doc.addEventListener("transitionend", onTransition, true);
  doc.addEventListener("transitioncancel", onTransition, true);
  view.addEventListener("pointerup", finishDrag, true);
  view.addEventListener("pointercancel", finishDrag, true);
  view.addEventListener("keydown", onKeyDown, true);
  view.addEventListener("blur", finish);
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    finish(); style.remove();
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("transitionrun", onTransition, true);
    doc.removeEventListener("transitionend", onTransition, true);
    doc.removeEventListener("transitioncancel", onTransition, true);
    view.removeEventListener("pointerup", finishDrag, true);
    view.removeEventListener("pointercancel", finishDrag, true);
    view.removeEventListener("keydown", onKeyDown, true);
    view.removeEventListener("blur", finish);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
