import assert from "node:assert/strict";
import { it } from "node:test";
import { JSDOM } from "jsdom";
import { injectPhoneDrawers } from "./phone-drawers.ts";
import { writeSidebarChrome } from "./sidebar-chrome.ts";

for (const [name, attributes, expected] of [
  ["commit sheet", 'data-bb-mobile-sheet-settle-haptic="off"', 1],
  ["ordinary sheet", "", 2],
] as const) {
  it(`${name} pulses at grab and follows its own release policy`, () => {
    const dom = new JSDOM(`<div data-persistent-drawer-content data-state="open" ${attributes}>
      <div data-persistent-drawer-handle><div></div></div>
    </div>`);
    const doc = dom.window.document;
    writeSidebarChrome(doc, { device: "phone", orientation: "portrait", viewport: "narrow", hitTarget: "large" });
    const drawer = doc.querySelector<HTMLElement>("[data-persistent-drawer-content]")!;
    const handle = drawer.querySelector("[data-persistent-drawer-handle]")!;
    drawer.getBoundingClientRect = () => ({ top: 400, bottom: 720, left: 8, right: 382, width: 374, height: 320 } as DOMRect);
    let now = 0;
    Object.defineProperty(dom.window.performance, "now", { value: () => now });
    Object.assign(dom.window, { matchMedia: () => ({ matches: true }) });
    const pulses: unknown[] = [];
    Object.assign(dom.window, { bb: { native: { capabilities: ["haptic"], post: (message: unknown) => pulses.push(message) } } });
    const dispose = injectPhoneDrawers(doc);
    const send = (type: string, y: number) => {
      now += 200;
      const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY: y });
      Object.defineProperties(event, { pointerId: { value: 7 }, isPrimary: { value: true } });
      handle.dispatchEvent(event);
    };
    send("pointerdown", 410);
    assert.equal(pulses.length, 1, "one grab haptic");
    send("pointermove", 18);
    assert.equal(pulses.length, 1, "no motion haptic");
    send("pointerup", 18);
    assert.equal(drawer.getAttribute("data-bb-mobile-sheet-stage"), "expanded");
    assert.equal(pulses.length, expected, "release haptic follows the sheet policy");
    dispose(); dom.window.close();
  });
}
