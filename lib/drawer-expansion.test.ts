import assert from "node:assert/strict";
import { it } from "node:test";
import { JSDOM } from "jsdom";
import { injectDrawerExpansion } from "./drawer-expansion.ts";
import { writeSidebarChrome, SIDEBAR_CHROME_EVENT } from "./sidebar-chrome.ts";

it("widens continuously on drag-up, settles expanded, collapses on drag-down and preserves native close", () => {
  const dom = new JSDOM(`<div data-persistent-drawer-content data-state="open" style="bottom:280px;transform:translate3d(0,0,0)">
    <div data-persistent-drawer-handle><div id="grab"></div></div><input value="draft">
  </div>`);
  const doc = dom.window.document, drawer = doc.querySelector<HTMLElement>("[data-persistent-drawer-content]")!;
  writeSidebarChrome(doc, { device: "phone", orientation: "portrait", viewport: "narrow", hitTarget: "large" });
  drawer.getBoundingClientRect = () => ({ top: 400, bottom: 720, left: 8, right: 382, width: 374, height: 320 } as DOMRect);
  let now = 0;
  Object.defineProperty(dom.window.performance, "now", { value: () => now });
  Object.assign(dom.window, { matchMedia: () => ({ matches: true }) });
  const pulses: unknown[] = [];
  Object.assign(dom.window, { bb: { native: { capabilities: ["haptic"], post: (message: unknown) => pulses.push(message) } } });
  const dispose = injectDrawerExpansion(doc);
  let cancels = 0;
  drawer.addEventListener("pointercancel", () => cancels++);
  const send = (type: string, y: number, target: Element = doc.querySelector("#grab")!) => {
    now += 200;
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY: y, clientX: 195 });
    Object.defineProperties(event, { pointerId: { value: 7 }, isPrimary: { value: true } });
    target.dispatchEvent(event);
    return event;
  };
  send("pointerdown", 410);
  const second = new dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true });
  Object.defineProperties(second, { pointerId: { value: 8 }, isPrimary: { value: false } });
  doc.querySelector("#grab")!.dispatchEvent(second);
  assert.equal(second.defaultPrevented, true);
  send("pointermove", 210);
  const middle = Number.parseFloat(drawer.style.getPropertyValue("--bb-mobile-sheet-inset"));
  assert.ok(middle > 0 && middle < 8);
  send("pointermove", 18);
  send("pointerup", 18);
  assert.equal(drawer.getAttribute("data-bb-mobile-sheet-stage"), "expanded");
  assert.equal(drawer.style.getPropertyValue("--bb-mobile-sheet-inset"), "0px");
  assert.equal(drawer.style.getPropertyValue("--bb-mobile-sheet-height"), "720px");
  assert.equal(cancels, 1);
  assert.deepEqual(pulses, [{ type: "haptic", kind: "impact-light" }]);
  // Native layout is still the same node with the same input and keyboard-owned bottom.
  assert.equal(drawer.style.bottom, "280px");
  assert.equal(doc.querySelector("input")!.value, "draft");
  send("pointerdown", 18);
  send("pointermove", 390);
  send("pointerup", 390);
  assert.equal(drawer.getAttribute("data-bb-mobile-sheet-stage"), null);
  assert.equal(cancels, 2);
  assert.equal(pulses.length, 2);
  send("pointerdown", 410);
  assert.equal(send("pointermove", 530).defaultPrevented, false);
  assert.equal(send("pointerup", 530).defaultPrevented, false);
  dispose();
  assert.equal(drawer.style.getPropertyValue("--bb-mobile-sheet-height"), "");
  dom.window.close();
});

it("still widens gradually when a landscape drawer has no extra vertical room", () => {
  const dom = new JSDOM(`<main data-thread-window></main><div data-persistent-drawer-content data-state="open"><div data-persistent-drawer-handle></div></div>`);
  const doc = dom.window.document;
  writeSidebarChrome(doc, { device: "phone", orientation: "landscape", viewport: "narrow", hitTarget: "large" });
  const drawer = doc.querySelector<HTMLElement>("[data-persistent-drawer-content]")!;
  drawer.getBoundingClientRect = () => ({ top: 32, bottom: 382, height: 350 } as DOMRect);
  doc.querySelector("main")!.getBoundingClientRect = () => ({ top: 48 } as DOMRect);
  const dispose = injectDrawerExpansion(doc);
  const send = (type: string, y: number) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    drawer.firstElementChild!.dispatchEvent(event);
  };
  send("pointerdown", 42); send("pointermove", 18);
  assert.equal(drawer.style.getPropertyValue("--bb-mobile-sheet-inset"), "4px");
  assert.equal(drawer.style.getPropertyValue("--bb-mobile-sheet-height"), "354px");
  send("pointercancel", 18);
  dispose(); dom.window.close();
});

it("restores geometry on pointer cancellation, device change, native close and disposal", async () => {
  const dom = new JSDOM(`<div data-persistent-drawer-content data-state="open"><div data-persistent-drawer-handle></div></div>`);
  const doc = dom.window.document, drawer = doc.querySelector<HTMLElement>("[data-persistent-drawer-content]")!;
  const handle = drawer.firstElementChild!;
  const chrome = { device: "phone", orientation: "portrait", viewport: "narrow", hitTarget: "large" } as const;
  writeSidebarChrome(doc, chrome);
  drawer.getBoundingClientRect = () => ({ top: 400, bottom: 720, left: 8, right: 382, width: 374, height: 320 } as DOMRect);
  Object.assign(dom.window, { matchMedia: () => ({ matches: true }) });
  const dispose = injectDrawerExpansion(doc);
  const send = (type: string, y: number) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    handle.dispatchEvent(event);
  };
  send("pointerdown", 410); send("pointermove", 20); send("pointercancel", 20);
  assert.equal(drawer.getAttribute("data-bb-mobile-sheet-stage"), null);
  send("pointerdown", 410); send("pointermove", 20); send("pointerup", 20);
  drawer.setAttribute("data-state", "closed");
  await Promise.resolve();
  assert.equal(drawer.getAttribute("data-bb-mobile-sheet-stage"), null);
  drawer.setAttribute("data-state", "open");
  send("pointerdown", 410); send("pointermove", 20); send("pointerup", 20);
  writeSidebarChrome(doc, { ...chrome, device: "desktop" });
  dom.window.dispatchEvent(new dom.window.Event(SIDEBAR_CHROME_EVENT));
  assert.equal(drawer.getAttribute("data-bb-mobile-sheet-stage"), null);
  dispose(); dispose();
  dom.window.close();
});
