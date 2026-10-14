import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { mountWorkspaceChrome } from "./workspace-chrome.ts";

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture() {
  const dom = new JSDOM(`<div data-app-content-shell>
    <div data-split-pane-id="chat"><div data-original>
      <header data-testid="app-page-header-content-row"><p class="cursor-grab">Chat</p><button>Menu</button></header>
      <div data-thread-window><textarea>draft</textarea></div>
    </div></div>
    <div data-split-pane-id="codes"><div data-original>
      <header data-testid="app-page-header-content-row"><div class="cursor-grab"><span data-icon-root data-plugin-icon-asset="/codes.svg" style="mask-image:url(/codes.svg)"></span>Codes</div></header>
      <div data-bb-plugin-root data-bb-plugin="codes">Editor</div>
    </div></div>
    <div data-split-resize-grid-root data-panel-group><div data-panel><aside><div data-original><div data-testid="secondary-panel-tab-strip"><button aria-pressed="true"><svg data-icon-root data-icon="Terminal"></svg>Terminal</button></div>Right panel</div></aside></div></div>
  </div><div data-sidebar="gap"></div><button id="outside">Sidebar</button><button id="toggle" aria-label="Toggle sidebar (⌘ B)">Toggle</button>`, { url: "https://bb.test/" });
  const doc = dom.window.document;
  const stop = mountWorkspaceChrome(doc, { pluginId: "sidebar", device: "desktop", navigate: () => assert.fail("drag must not navigate") });
  const down = (selector = '.cursor-grab', button = 0) => doc.querySelector(selector)!.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button }));
  const ghost = () => { const e = doc.createElement("div"); e.dataset.splitDragGhost = ""; doc.body.append(e); return e; };
  return { dom, doc, stop, down, ghost };
}

test("engaged pane drags replace all visible surfaces with icons without detaching content", async t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  const content = Array.from(f.doc.querySelectorAll('[data-original]'));
  const input = f.doc.querySelector('textarea')!; input.value = 'unsent draft';
  f.down(); await settle();
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0, "a title press alone is not a drag");
  f.ghost(); await settle();
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 3);
  for (const e of content) { assert.equal(e.isConnected, true); assert.equal(f.dom.window.getComputedStyle(e).visibility, "hidden"); }
  assert.equal(input.value, 'unsent draft');
  const clone = f.doc.querySelector('[data-split-pane-id="codes"] [data-sidebar-pane-placeholder] [data-plugin-icon-asset]');
  assert.equal(clone?.getAttribute('data-plugin-icon-asset'), '/codes.svg');
  assert.notEqual(clone, f.doc.querySelector('header [data-plugin-icon-asset]'));
  assert.ok(f.doc.querySelector('[data-split-pane-id="chat"] [data-sidebar-pane-placeholder] svg'));
  assert.ok(f.doc.querySelector('aside [data-sidebar-pane-placeholder] [data-icon="Terminal"]'));
});

function transition(f: ReturnType<typeof fixture>, type: string, selector = '[data-sidebar="gap"]', property = 'width') {
  const event = new f.dom.window.Event(type, { bubbles:true });
  Object.defineProperty(event, 'propertyName', { value:property });
  f.doc.querySelector(selector)!.dispatchEvent(event);
}

test("sidebar toggles prepare placeholders before the host click and restore the same content after motion", async t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  const original = f.doc.querySelector<HTMLElement>('[data-original]')!;
  const input = f.doc.querySelector('textarea')!; input.value = 'keep this draft';
  let duringClick = 0;
  f.doc.querySelector('#toggle')!.addEventListener('click', () => { duringClick = f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length; });
  f.doc.querySelector<HTMLButtonElement>('#toggle')!.click();
  assert.equal(duringClick, 3);
  assert.equal(f.dom.window.getComputedStyle(original).contentVisibility, 'hidden');
  transition(f, 'transitionrun');
  f.dom.window.dispatchEvent(new f.dom.window.Event('pointerup'));
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 3, 'releasing the toggle must not finish the transition');
  transition(f, 'transitionend'); await settle();
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
  assert.equal(original.isConnected, true);
  assert.notEqual(f.dom.window.getComputedStyle(original).contentVisibility, 'hidden');
  assert.equal(input.value, 'keep this draft');
});

test("sidebar transitions from keyboard or host state wait for both sides and survive reversal", async t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  transition(f, 'transitionrun');
  transition(f, 'transitionrun', '[data-panel]', 'flex-grow');
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 3);
  transition(f, 'transitioncancel');
  transition(f, 'transitionrun');
  transition(f, 'transitionend', '[data-panel]', 'flex-grow'); await settle();
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 3);
  transition(f, 'transitionend'); await settle();
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
});

test("sidebar motion and pane dragging own their placeholder lifetimes independently", async t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  transition(f, 'transitionrun');
  assert.equal(f.doc.querySelectorAll('[data-sidebar-motion-pane]').length, 3);
  f.down(); f.ghost(); await settle();
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 3, 'no duplicate placeholders');
  transition(f, 'transitionend'); await settle();
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 3, 'drag continues after sidebar motion');
  assert.equal(f.doc.querySelectorAll('[data-sidebar-motion-pane]').length, 0);
  f.dom.window.dispatchEvent(new f.dom.window.Event('pointerup'));
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
});

test("unrelated transitions and reduced motion never start sidebar placeholders", t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  transition(f, 'transitionrun', 'header', 'opacity');
  transition(f, 'transitionrun', '[data-sidebar="gap"]', 'color');
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
  Object.defineProperty(f.dom.window, 'matchMedia', { value:() => ({ matches:true }) });
  f.doc.querySelector<HTMLButtonElement>('#toggle')!.click();
  transition(f, 'transitionrun');
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
});

test("sidebar placeholders recover if a transition end never arrives", t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  t.mock.timers.enable({ apis:['setTimeout'] });
  transition(f, 'transitionrun');
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 3);
  t.mock.timers.tick(1500);
  assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
  assert.equal(f.doc.querySelectorAll('[data-sidebar-motion-pane]').length, 0);
});

for (const end of ['blur', 'dispose']) {
  test(`sidebar placeholders release frozen content on ${end}`, t => {
    const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
    transition(f, 'transitionrun');
    assert.equal(f.doc.querySelectorAll('[data-sidebar-motion-pane]').length, 3);
    if (end === 'dispose') f.stop();
    else f.dom.window.dispatchEvent(new f.dom.window.Event('blur'));
    assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
    assert.equal(f.doc.querySelectorAll('[data-sidebar-motion-pane]').length, 0);
  });
}

for (const end of ['pointerup', 'pointercancel', 'Escape', 'blur', 'ghost-removed', 'dispose']) {
  test(`pane placeholders restore original content on ${end}`, async t => {
    const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
    const original = f.doc.querySelector('[data-original]')!;
    f.down(); const ghost = f.ghost(); await settle();
    assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 3);
    if (end === 'ghost-removed') ghost.remove();
    else if (end === 'dispose') f.stop();
    else if (end === 'Escape') f.dom.window.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key:'Escape', code:'Escape', bubbles:true }));
    else f.dom.window.dispatchEvent(new f.dom.window.Event(end));
    await settle();
    assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
    assert.equal(f.doc.querySelectorAll('[data-sidebar-drag-pane]').length, 0);
    assert.equal(original.isConnected, true);
    assert.equal(f.dom.window.getComputedStyle(original).visibility, 'visible');
  });
}

test("sidebar drags, header buttons and secondary clicks never blank the panes", async t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  for (const [selector, button] of [['#outside', 0], ['header button', 0], ['.cursor-grab', 2]] as const) {
    f.down(selector, button); const ghost = f.ghost(); await settle();
    assert.equal(f.doc.querySelectorAll('[data-sidebar-pane-placeholder]').length, 0);
    ghost.remove(); f.dom.window.dispatchEvent(new f.dom.window.Event('pointerup'));
  }
});

test("thread placeholders show each pane's title and selected provider artwork", async t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  f.doc.querySelector('[data-split-pane-id="chat"] .cursor-grab')!.textContent = '첫 번째 <스레드>';
  const second = f.doc.createElement('div');
  second.dataset.splitPaneId = 'chat-two';
  second.innerHTML = '<header data-testid="app-page-header-content-row"><p class="cursor-grab">다른 스레드 제목</p></header><div data-thread-window>Second chat</div>';
  f.doc.querySelector('[data-app-content-shell]')!.append(second);
  const providers = f.doc.createElement('div'); providers.hidden = true;
  providers.innerHTML = '<span data-sidebar-thread-provider="thread-one"><span class="size-6"><span data-provider-logo="/codex.svg" style="mask-image:url(/codex.svg)"></span></span></span><span data-sidebar-thread-provider="thread-two"><span><svg data-custom-provider="claude"><path d="M1 1h4"></path></svg></span></span>';
  f.doc.body.append(providers);
  const children = ['chat', 'chat-two'].map((paneId, i) => ({ type:'pane', paneId, content:{ kind:'thread', projectId:'project', threadId:i ? 'thread-two' : 'thread-one' } }));
  f.dom.window.sessionStorage.setItem('bb.splitLayout', JSON.stringify({version:1, layout:{root:{type:'split',dir:'row',sizes:[0.5,0.5],children},focusedPaneId:'chat'}}));
  f.down(); f.ghost(); await settle();
  const first = f.doc.querySelector('[data-split-pane-id="chat"] [data-sidebar-pane-placeholder]')!;
  const other = second.querySelector('[data-sidebar-pane-placeholder]')!;
  assert.equal(first.querySelector('[data-sidebar-pane-placeholder-title]')?.textContent, '첫 번째 <스레드>');
  assert.equal(other.querySelector('[data-sidebar-pane-placeholder-title]')?.textContent, '다른 스레드 제목');
  assert.ok(first.querySelector('[data-provider-logo="/codex.svg"]'));
  assert.ok(other.querySelector('[data-custom-provider="claude"]'));
  assert.notEqual(first.querySelector('[data-provider-logo]'), providers.querySelector('[data-provider-logo]'));
  assert.equal(first.querySelector('스레드'), null, 'title is text, never HTML');
  assert.equal(f.doc.querySelector('[data-split-pane-id="codes"] [data-sidebar-pane-placeholder-title]'), null);
});

test("thread title remains available when provider metadata is missing", async t => {
  const f = fixture(); t.after(() => { f.stop(); f.dom.window.close(); });
  f.down(); f.ghost(); await settle();
  const placeholder = f.doc.querySelector('[data-split-pane-id="chat"] [data-sidebar-pane-placeholder]')!;
  assert.equal(placeholder.querySelector('[data-sidebar-pane-placeholder-title]')?.textContent, 'Chat');
  assert.ok(placeholder.querySelector('[data-sidebar-pane-placeholder-icon] svg'));
});
