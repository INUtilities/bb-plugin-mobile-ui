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
    <div data-panel><aside><div data-original><div data-testid="secondary-panel-tab-strip"><button aria-pressed="true"><svg data-icon-root data-icon="Terminal"></svg>Terminal</button></div>Right panel</div></aside></div>
  </div><button id="outside">Sidebar</button>`, { url: "https://bb.test/" });
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
