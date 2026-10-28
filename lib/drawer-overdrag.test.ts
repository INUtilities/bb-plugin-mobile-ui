import assert from "node:assert/strict";
import { it } from "node:test";
import { JSDOM } from "jsdom";
import { injectDrawerExpansion } from "./drawer-expansion.ts";
import { writeSidebarChrome } from "./sidebar-chrome.ts";

it("can drag past the resting maximum to the screen edge, then returns to the original maximum", () => {
  const dom = new JSDOM(`<main data-thread-window></main><div data-persistent-drawer-content data-state="open" style="bottom:280px">
    <div data-persistent-drawer-handle></div></div>`);
  const doc = dom.window.document;
  const drawer = doc.querySelector<HTMLElement>("[data-persistent-drawer-content]")!;
  writeSidebarChrome(doc, { device: "phone", orientation: "portrait", viewport: "narrow", hitTarget: "large" });
  doc.querySelector("main")!.getBoundingClientRect = () => ({ top: 48 } as DOMRect);
  drawer.getBoundingClientRect = () => ({ top: 222, bottom: 836, height: 614 } as DOMRect);
  Object.assign(dom.window, { matchMedia: () => ({ matches: true }) });
  const dispose = injectDrawerExpansion(doc);
  let now = 0;
  let elapsed = 200;
  Object.defineProperty(dom.window.performance, "now", { value: () => now });
  const send = (type: string, y: number) => {
    now += elapsed;
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    drawer.firstElementChild!.dispatchEvent(event);
  };
  const height = () => Number.parseFloat(drawer.style.getPropertyValue("--bb-mobile-sheet-height"));
  send("pointerdown", 232);
  send("pointermove", 30);
  assert.ok(height() > 788 && height() < 844);
  send("pointermove", -100);
  assert.equal(height(), 844); // top=0, bottom stays at 844; no upward translation gap below.
  assert.equal(drawer.style.getPropertyValue("--bb-mobile-sheet-offset"), "0px");
  elapsed = 1;
  send("pointermove", 30); // A fast reversal still above the maximum must not collapse the sheet.
  send("pointerup", 30);
  elapsed = 200;
  assert.equal(height(), 788); // resting top is still thread-window top + 8 = 56.
  assert.equal(drawer.getAttribute("data-bb-mobile-sheet-stage"), "expanded");
  send("pointerdown", 66); send("pointermove", 10);
  assert.equal(height(), 844);
  send("pointercancel", 10);
  assert.equal(height(), 788);
  assert.equal(drawer.style.bottom, "280px");
  dispose(); dom.window.close();
});
