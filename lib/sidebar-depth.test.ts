import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeSidebarChrome, SIDEBAR_CHROME_EVENT } from "./sidebar-chrome.ts";
import {
  applyChatDim,
  applyChatScreen,
  applyRightDepth,
  applySidebarDepth,
  isSidebarMotionTarget,
  injectSidebarDepth,
  sidebarDepthCss,
  mobileShelfProgress,
  nextSidebarPhase,
  blurComposerCaret,
  postSlideHaptic,
  slideHapticKind,
  isRightPanelTabPress,
  isRightPanelLauncherPress,
  rightPanelTabSwipe,
  readReleaseTarget,
  sidebarFingerRelease,
  readRightDepth,
  readRightShelfDepth,
  readSidebarDepth,
  readTranslateX,
  keepWatchingSlide,
  rightPanelDepthProgress,
  rightShelfProgress,
  sidebarDepthProgress,
  syncSidebarDepth,
} from "./sidebar-depth.ts";

const PHONE_CHROME = { device: "phone", orientation: "portrait", viewport: "narrow", hitTarget: "large" } as const;

describe("keepWatchingSlide", () => {
  it("keeps sampling through the slide instead of the first still frames", () => {
    assert.equal(keepWatchingSlide(160), true);
    assert.equal(keepWatchingSlide(719), true);
    assert.equal(keepWatchingSlide(720), false);
  });
});

describe("sidebarDepthProgress", () => {
  it("follows how much of the panel is still on screen", () => {
    assert.equal(sidebarDepthProgress({ left: 0, width: 256 }), 1);
    assert.equal(sidebarDepthProgress({ left: -128, width: 256 }), 0.5);
    assert.equal(sidebarDepthProgress({ left: -256, width: 256 }), 0);
  });
});

describe("rightPanelDepthProgress", () => {
  it("measures how much of the right panel the clip still shows", () => {
    const panel = { left: 100, right: 300, width: 200 };
    assert.equal(rightPanelDepthProgress(panel, { left: 100, right: 300 }), 1);
    assert.equal(rightPanelDepthProgress(panel, { left: 200, right: 300 }), 0.5);
    assert.equal(rightPanelDepthProgress(panel, { left: 300, right: 300 }), 0);
  });
});

describe("rightShelfProgress", () => {
  it("maps a leftward inset translate onto the shelf width", () => {
    assert.equal(rightShelfProgress(0, 320), 0);
    assert.equal(rightShelfProgress(160, 320), 0);
    assert.equal(rightShelfProgress(-160, 320), 0.5);
    assert.equal(rightShelfProgress(-320, 320), 1);
  });
});

describe("mobileShelfProgress", () => {
  it("maps inset translate to the same 0-1 range", () => {
    assert.equal(mobileShelfProgress(0, 320), 0);
    assert.equal(mobileShelfProgress(160, 320), 0.5);
    assert.equal(mobileShelfProgress(320, 320), 1);
  });
});

describe("readTranslateX", () => {
  it("reads translate and matrix values", () => {
    assert.equal(readTranslateX({ translate: "120px" }), 120);
    assert.equal(readTranslateX({ transform: "matrix(1, 0, 0, 1, 80, 0)" }), 80);
    assert.equal(readTranslateX({ transform: "none" }), 0);
  });

  it("resolves a percentage against the element that is translating", () => {
    assert.equal(readTranslateX({ translate: "-100%" }, 390), -390);
    assert.equal(readTranslateX({ translate: "-50% 0px" }, 390), -195);
  });
});

describe("applySidebarDepth", () => {
  it("writes the depth variable and parks only when fully receded", () => {
    const panel = {
      dataset: {} as Record<string, string | undefined>,
      style: {
        props: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.props.set(name, value);
        },
      },
    };
    applySidebarDepth(panel as unknown as HTMLElement, 0.4);
    assert.equal(panel.style.props.get("--lite-sidebar-depth"), "0.4");
    assert.equal(panel.dataset.liteSidebarParked, undefined);
    applySidebarDepth(panel as unknown as HTMLElement, 0);
    assert.equal(panel.dataset.liteSidebarParked, "");
  });
});

describe("readSidebarDepth", () => {
  it("reads desktop geometry instead of a phone drawer at the same width", () => {
    const doc = { querySelector: () => null } as unknown as Document;
    writeSidebarChrome(doc, { device: "desktop", orientation: "portrait", viewport: "narrow", hitTarget: "small" });
    const panel = {
      getAttribute: (name: string) => name === "data-vaul-drawer-direction" ? "left" : null,
      getBoundingClientRect: () => ({ left: 0, width: 320 }),
    } as unknown as HTMLElement;
    assert.equal(readSidebarDepth(doc, panel), 1);
  });
  it("uses the mobile inset when the drawer attribute is present", () => {
    const inset = { style: { translate: "80px", transform: "" } };
    const panel = {
      getAttribute: (name: string) => (name === "data-vaul-drawer-direction" ? "left" : null),
      getBoundingClientRect: () => ({ left: 0, width: 160 }),
    };
    const doc = {
      querySelector: () => inset,
      defaultView: null,
    };
    writeSidebarChrome(doc as unknown as Document, PHONE_CHROME);
    assert.equal(readSidebarDepth(doc as unknown as Document, panel as unknown as HTMLElement), 0.5);
  });
});

describe("readRightDepth", () => {
  it("pins a sized panel to the right and reads the clip overlap", () => {
    const clip = { left: 200, right: 300, width: 100 };
    const aside = {
      dataset: {} as Record<string, string | undefined>,
      style: {
        width: "40cqw",
        props: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.props.set(name, value);
        },
      },
      parentElement: { getBoundingClientRect: () => clip },
      getBoundingClientRect: () => ({ left: 100, right: 300, width: 200 }),
    };
    const doc = {
      defaultView: null,
      querySelectorAll: (selector: string) =>
        selector === "[data-panel] > aside" ? [aside] : [],
    };
    writeSidebarChrome(doc as unknown as Document, PHONE_CHROME);
    assert.equal(syncSidebarDepth(doc as unknown as Document), 1);
    assert.equal(aside.dataset.bbMotionPin, "");
    assert.equal(readRightDepth(aside as unknown as HTMLElement), 0.5);
    assert.equal(aside.style.props.get("--bb-motion-right-depth"), "0.5");
  });

});

describe("readRightShelfDepth", () => {
  function shelfDoc(translate: string, insetWidth: number, shelfWidth: number) {
    const inset = {
      style: { translate: "", transform: "" },
      getBoundingClientRect: () => ({ width: insetWidth }),
    };
    const shelf = {
      getAttribute: () => "full",
      getBoundingClientRect: () => ({ width: shelfWidth }),
    };
    const doc = {
      querySelector: () => inset,
      defaultView: {
        getComputedStyle: () => ({ translate, transform: "none" }),
      },
    };
    return { doc, shelf };
  }

  it("opens fully when the mobile full shelf translate is -100%", () => {
    const { doc, shelf } = shelfDoc("-100%", 390, 390);
    assert.equal(
      readRightShelfDepth(doc as unknown as Document, shelf as unknown as HTMLElement),
      1,
    );
  });

  it("resolves a percentage against the inset width", () => {
    const { doc, shelf } = shelfDoc("-50%", 200, 400);
    assert.equal(
      readRightShelfDepth(doc as unknown as Document, shelf as unknown as HTMLElement),
      0.25,
    );
  });
});

describe("applyChatDim", () => {
  it("darkens the chat while the mobile shelf is open and clears it when shut", () => {
    const inset = {
      dataset: {} as Record<string, string | undefined>,
      style: {
        props: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.props.set(name, value);
        },
        removeProperty(name: string) {
          this.props.delete(name);
        },
      },
    };
    applyChatDim(inset as unknown as HTMLElement, 0.5);
    assert.equal(inset.dataset.bbMotionChatDim, "");
    assert.equal(inset.style.props.get("--bb-motion-chat-dim"), "0.5");
    applyChatDim(inset as unknown as HTMLElement, 0);
    assert.equal(inset.dataset.bbMotionChatDim, undefined);
    assert.equal(inset.style.props.get("--bb-motion-chat-dim"), undefined);
  });
});

describe("applyRightDepth", () => {
  it("drops the right pin when the panel is being dragged", () => {
    const panel = {
      dataset: { bbMotionPin: "" } as Record<string, string | undefined>,
      style: {
        props: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.props.set(name, value);
        },
      },
    };
    applyRightDepth(panel as unknown as HTMLElement, 1, false);
    assert.equal(panel.dataset.bbMotionPin, undefined);
    assert.equal(panel.dataset.bbMotionRightParked, undefined);
    assert.equal(panel.dataset.bbMotionSettled, "");
  });

  it("drops the resting filter while a browser or terminal tab is open", () => {
    const panel = {
      dataset: {} as Record<string, string | undefined>,
      style: {
        props: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.props.set(name, value);
        },
      },
    };
    applyRightDepth(panel as unknown as HTMLElement, 1, true);
    assert.equal(panel.dataset.bbMotionSettled, "");
    applyRightDepth(panel as unknown as HTMLElement, 0.9, true);
    assert.equal(panel.dataset.bbMotionSettled, "");
    applyRightDepth(panel as unknown as HTMLElement, 0.4, true);
    assert.equal(panel.dataset.bbMotionSettled, undefined);
    applyRightDepth(panel as unknown as HTMLElement, 0, true);
    assert.equal(panel.dataset.bbMotionSettled, undefined);
    assert.equal(panel.dataset.bbMotionRightParked, "");
  });
});

describe("isSidebarMotionTarget", () => {
  it("follows the panel shell and ignores a browser or terminal inside it", () => {
    const panel = motionTarget("DIV", { "data-panel": "" }, null);
    const aside = motionTarget("ASIDE", {}, panel);
    const terminal = motionTarget("DIV", {}, aside);
    const browser = motionTarget("DIV", {}, aside);
    assert.equal(isSidebarMotionTarget(panel as unknown as EventTarget), true);
    assert.equal(isSidebarMotionTarget(aside as unknown as EventTarget), true);
    assert.equal(isSidebarMotionTarget(terminal as unknown as EventTarget), false);
    assert.equal(isSidebarMotionTarget(browser as unknown as EventTarget), false);
  });
});

function motionTarget(
  tag: string,
  attrs: Record<string, string>,
  parent: ReturnType<typeof motionTarget> | null,
): ReturnType<typeof motionTarget> {
  const element = {
    tagName: tag,
    parentElement: parent,
    attrs,
    matches(selector: string) {
      return selector.split(",").some((part) => {
        const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(part.trim());
        if (attr === null) return false;
        if (attr[2] === undefined) return element.attrs[attr[1]] !== undefined;
        return element.attrs[attr[1]] === attr[2];
      });
    },
    closest() {
      return null;
    },
  };
  return element;
}

describe("syncSidebarDepth", () => {
  it("applies the current phone panel rect", () => {
    const panel = {
      dataset: {} as Record<string, string | undefined>,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ left: -64, width: 256 }),
      style: {
        props: new Map<string, string>(),
        setProperty(name: string, value: string) {
          this.props.set(name, value);
        },
      },
    };
    const doc = {
      defaultView: null,
      querySelectorAll: (selector: string) =>
        selector === '[data-sidebar="panel"]' ? [panel] : [],
    };
    writeSidebarChrome(doc as unknown as Document, PHONE_CHROME);
    assert.equal(syncSidebarDepth(doc as unknown as Document), 1);
    assert.equal(panel.style.props.get("--lite-sidebar-depth"), "0.75");
  });
});

function assertPhoneStyles(css: string): void {
  assert.match(css, /brightness\(calc\(0\.7 \+ var\(--lite-sidebar-depth\) \* 0\.3\)\)/);
  assert.doesNotMatch(css, /brightness\(calc\(0\.7 \+ var\(--bb-motion-right-depth\) \* 0\.3\)\)/);
  assert.doesNotMatch(css, /perspective\(/);
  assert.doesNotMatch(css, /scale\(/);
  assert.doesNotMatch(css, /opacity: calc\(0\.16/);
  assert.match(
    css,
    /\[data-sidebar="panel"\]\[data-vaul-drawer-direction="left"\] \{[^}]*translateX\(calc\(\(1 - var\(--lite-sidebar-depth\)\) \* -50%\)\)/,
  );
  assert.doesNotMatch(
    css,
    /\[data-sidebar="panel"\]\[data-vaul-drawer-direction="left"\] \{[^}]*z-index/,
  );
  assert.match(
    css,
    /\/\* bb-sidebar-phone-shelf \*\/\s*@media (?:not )?all \{[^]*\[data-testid="secondary-panel-shelf"\]:not\(\[data-bb-motion-settled\]\) \{\s*transform: translateX\(calc\(\(1 - min\(var\(--bb-motion-right-depth\), 0\.75\) \/ 0\.75\) \* 100%\)\);/,
  );
  assert.doesNotMatch(css, /\[data-sidebar="inset"\]\[data-panel-shelf\]\s*\{[^}]*transition:\s*translate/);
  assert.match(
    css,
    /\/\* bb-sidebar-phone-shelf \*\/\s*@media (?:not )?all \{[^]*\[data-sidebar="inset"\]\[data-bb-motion-chat-dim\] \{[^}]*brightness\(calc\(1 - var\(--bb-motion-chat-dim\) \* 0\.45\)\)[^}]*translateX\(calc\(var\(--bb-motion-chat-dim\) \* 50%\)\)/,
  );
  assert.doesNotMatch(css.match(/\[data-testid="secondary-panel-shelf"\] \{[^}]*\}/)?.[0] ?? "", /transform:/);
  assert.doesNotMatch(css, /z-index:\s*35/);
  const aside =
    css.match(/\[data-panel\] > aside \{\s*top:[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(aside, /filter:/);
  assert.doesNotMatch(css, /style\*="220ms"/);
  assert.doesNotMatch(css, /data-bb-motion-pin/);
  assert.doesNotMatch(aside, /translateX/);
  assert.match(
    css,
    /\/\* bb-sidebar-phone-shelf \*\/\s*@media (?:not )?all \{\s*\[data-sidebar="inset"\]\[data-bb-motion-screen\] \{\s*border-radius: 55px;\s*overflow: clip;\s*box-shadow: -12px 0 24px rgb\(0 0 0 \/ 0\.10\);/,
  );
  assert.match(
    css,
    /\/\* bb-sidebar-phone-shelf \*\/\s*@media (?:not )?all \{[^]*\[data-sidebar="panel"\]\[data-vaul-drawer-direction="left"\] \{\s*border-right-color: transparent;\s*box-shadow: 67px 0 0 0 var\(--sidebar\);/,
  );
  assert.match(
    css,
    /\/\* bb-sidebar-phone-shelf \*\/\s*@media (?:not )?all \{[^]*\[data-testid="secondary-panel-shelf"\] \{\s*background-color: var\(--sidebar\);[^}]*border-top-left-radius: 48px;\s*border-bottom-left-radius: 48px;\s*corner-shape: squircle;\s*border-left-color: transparent;/,
  );
  assert.match(
    css,
    /\/\* bb-sidebar-phone-shelf \*\/\s*@media (?:not )?all \{[^]*\[data-sidebar="inset"\]\[data-panel-shelf="shelf"\],\s*\[data-sidebar="inset"\]\[data-panel-shelf="full"\] \{\s*border-top-right-radius: 0;\s*border-bottom-right-radius: 0;\s*box-shadow: 67px 0 0 0 var\(--background\);/,
  );
}

describe("syncSidebarDepth chat screen", () => {
  it("does not haptic when the first sample is already pushed", () => {
    const sent: unknown[] = [];
    let translate = "80px";
    const inset = {
      dataset: {} as Record<string, string | undefined>,
      style: { translate: "", transform: "" },
      getAttribute: () => null,
      getBoundingClientRect: () => ({ width: 390 }),
    };
    const doc = {
      defaultView: {
        bb: { native: { post: (message: unknown) => sent.push(message), capabilities: ["haptic"] } },
        getComputedStyle: () => ({ translate, transform: "none" }),
        matchMedia: () => ({ matches: false }),
      },
      querySelector: (selector: string) => (selector === '[data-sidebar="inset"]' ? inset : null),
      querySelectorAll: () => [],
    };
    writeSidebarChrome(doc as unknown as Document, PHONE_CHROME);
    syncSidebarDepth(doc as unknown as Document);
    assert.equal(inset.dataset.bbMotionScreen, "");
    assert.deepEqual(sent, []);
    translate = "0px";
    syncSidebarDepth(doc as unknown as Document);
    assert.deepEqual(sent, [{ type: "haptic", kind: "impact-light" }]);
    translate = "80px";
    syncSidebarDepth(doc as unknown as Document);
    assert.deepEqual(sent, [
      { type: "haptic", kind: "impact-light" },
      { type: "haptic", kind: "impact-light" },
    ]);
    translate = "-80px";
    syncSidebarDepth(doc as unknown as Document);
    assert.deepEqual(sent, [
      { type: "haptic", kind: "impact-light" },
      { type: "haptic", kind: "impact-light" },
      { type: "haptic", kind: "impact-light" },
      { type: "haptic", kind: "impact-light" },
    ]);
    translate = "0px";
    syncSidebarDepth(doc as unknown as Document);
    assert.equal(sent.length, 5);
    assert.deepEqual(sent[4], { type: "haptic", kind: "impact-light" });
  });
});

type ReleaseEl = {
  attrs: Record<string, string>;
  parent: ReleaseEl | null;
  closest(selector: string): ReleaseEl | null;
  matches(selector: string): boolean;
  getAttribute(name: string): string | null;
};

function releaseElement(attrs: Record<string, string>, parent: ReleaseEl | null = null): ReleaseEl {
  const element: ReleaseEl = {
    attrs,
    parent,
    getAttribute(name) {
      return element.attrs[name] ?? null;
    },
    matches(selector) {
      return selector.split(",").some((part) => releaseSelectorMatches(element, part.trim()));
    },
    closest(selector) {
      let node: ReleaseEl | null = element;
      while (node !== null) {
        if (node.matches(selector)) return node;
        node = node.parent;
      }
      return null;
    },
  };
  return element;
}

function releaseSelectorMatches(element: ReleaseEl, selector: string): boolean {
  if (/^[a-z]+$/.test(selector)) return element.attrs.tag === selector;
  const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (attr === null) return false;
  if (attr[2] === undefined) return element.attrs[attr[1]] !== undefined;
  return element.attrs[attr[1]] === attr[2];
}

describe("sidebar finger release", () => {
  it("does not use phone release haptics on desktop at the same narrow viewport", () => {
    const harness = mountFingerHarness({ ...PHONE_CHROME, device: "desktop", hitTarget: "small" });
    try {
      harness.fire("pointerdown", { type: "pointerdown", button: 0, pointerId: 1, clientX: 8, clientY: 8, target: harness.trigger });
      harness.fire("pointerup", { type: "pointerup", button: 0, pointerId: 1, clientX: 9, clientY: 8, target: harness.trigger });
      assert.deepEqual(harness.sent, []);
    } finally {
      harness.stop();
    }
  });
  it("buzzes when the finger lifts and stays quiet when the slide sample catches up", () => {
    const harness = mountFingerHarness();
    try {
      harness.sync();
      assert.deepEqual(harness.sent, []);
      harness.fire("pointerdown", {
        type: "pointerdown",
        button: 0,
        pointerId: 1,
        clientX: 8,
        clientY: 8,
        target: harness.trigger,
      });
      harness.fire("pointerup", {
        type: "pointerup",
        button: 0,
        pointerId: 1,
        clientX: 9,
        clientY: 8,
        target: harness.trigger,
      });
      assert.deepEqual(harness.sent, [{ type: "haptic", kind: "impact-light" }]);
      harness.setTranslate("80px");
      harness.sync();
      assert.equal(harness.sent.length, 1);

      harness.fire("pointerdown", {
        type: "pointerdown",
        button: 0,
        pointerId: 2,
        clientX: 20,
        clientY: 20,
        target: harness.child,
      });
      harness.fire("pointerup", {
        type: "pointerup",
        button: 0,
        pointerId: 2,
        clientX: 22,
        clientY: 24,
        target: harness.child,
      });
      assert.equal(harness.sent.length, 1);
    } finally {
      harness.stop();
    }
  });

  it("does not buzz twice when touchend and pointerup both arrive", () => {
    const harness = mountFingerHarness();
    try {
      harness.sync();
      harness.fire("touchstart", {
        type: "touchstart",
        target: harness.trigger,
        touches: [{ identifier: 3, clientX: 8, clientY: 8 }],
      });
      harness.fire("pointerdown", {
        type: "pointerdown",
        button: 0,
        pointerId: 4,
        clientX: 8,
        clientY: 8,
        target: harness.trigger,
      });
      harness.fire("touchend", {
        type: "touchend",
        target: harness.trigger,
        changedTouches: [{ identifier: 3, clientX: 9, clientY: 8 }],
      });
      harness.fire("pointerup", {
        type: "pointerup",
        button: 0,
        pointerId: 4,
        clientX: 9,
        clientY: 8,
        target: harness.trigger,
      });
      assert.deepEqual(harness.sent, [{ type: "haptic", kind: "impact-light" }]);
    } finally {
      harness.stop();
    }
  });

  it("stays quiet when a short edge swipe lets go before the drawer commits", () => {
    const harness = mountFingerHarness();
    try {
      harness.sync();
      harness.fire("pointerdown", {
        type: "pointerdown",
        button: 0,
        pointerId: 1,
        clientX: 40,
        clientY: 40,
        target: harness.insetTarget,
      });
      harness.setTranslate("40px");
      harness.sync();
      assert.deepEqual(harness.sent, []);
      harness.fire("pointerup", {
        type: "pointerup",
        button: 0,
        pointerId: 1,
        clientX: 70,
        clientY: 40,
        target: harness.insetTarget,
      });
      assert.deepEqual(harness.sent, []);
      harness.sync();
      harness.setTranslate("0px");
      harness.sync();
      assert.deepEqual(harness.sent, []);
    } finally {
      harness.stop();
    }
  });

  it("buzzes a dismiss drag when the finger lifts and skips the later close sample", () => {
    const harness = mountFingerHarness();
    try {
      harness.sync();
      harness.setTranslate("80px");
      harness.sync();
      assert.equal(harness.sent.length, 1);
      harness.fire("pointerdown", {
        type: "pointerdown",
        button: 0,
        pointerId: 1,
        clientX: 220,
        clientY: 40,
        target: harness.child,
      });
      harness.fire("pointerup", {
        type: "pointerup",
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 40,
        target: harness.child,
      });
      assert.equal(harness.sent.length, 2);
      harness.setTranslate("0px");
      harness.sync();
      assert.equal(harness.sent.length, 2);

      harness.setTranslate("80px");
      harness.sync();
      const beforeSnap = harness.sent.length;
      harness.fire("pointerdown", {
        type: "pointerdown",
        button: 0,
        pointerId: 2,
        clientX: 200,
        clientY: 40,
        target: harness.child,
      });
      harness.fire("pointerup", {
        type: "pointerup",
        button: 0,
        pointerId: 2,
        clientX: 180,
        clientY: 40,
        target: harness.child,
      });
      harness.sync();
      assert.equal(harness.sent.length, beforeSnap);
    } finally {
      harness.stop();
    }
  });
});

function mountFingerHarness(chrome = PHONE_CHROME as Parameters<typeof writeSidebarChrome>[1]) {
  const sent: unknown[] = [];
  let frames = 0;
  let cancelledFrames = 0;
  let time = 0;
  let translate = "0px";
  let blurCount = 0;
  const composer = releaseElement({ "data-promptbox": "" });
  const editor = Object.assign(releaseElement({}, composer), {
    blur() {
      blurCount += 1;
    },
  });
  const listeners = new Map<string, Array<(event: Event) => void>>();
  const trigger = releaseElement({ "data-sidebar": "trigger", tag: "button" });
  const row = releaseElement({ "data-sidebar": "panel" });
  const child = releaseElement({}, row);
  const insetTarget = releaseElement({ "data-sidebar": "inset" });
  const inset = {
    dataset: {} as Record<string, string | undefined>,
    style: { translate: "", transform: "" },
    getAttribute: () => null as string | null,
    getBoundingClientRect: () => ({ width: 390, left: 0, height: 800, right: 390, top: 0, bottom: 800 }),
  };
  const panel = {
    getAttribute: (name: string) => (name === "data-vaul-drawer-direction" ? "left" : null),
    getBoundingClientRect: () => ({ width: 300, left: 0, height: 800, right: 300, top: 0, bottom: 800 }),
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
  };
  const doc = {
    activeElement: editor,
    body: {},
    defaultView: {
      bb: { native: { post: (message: unknown) => sent.push(message), capabilities: ["haptic"] } },
      getComputedStyle: () => ({ translate, transform: "none" }),
      matchMedia: (query: string) => ({ matches: query.includes("max-width") }),
      requestAnimationFrame: () => ++frames,
      cancelAnimationFrame: () => { cancelledFrames += 1; },
      performance: { now: () => time },
      addEventListener: (type: string, fn: (event: Event) => void) => {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      },
      removeEventListener: (type: string, fn: (event: Event) => void) => {
        listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== fn));
      },
    },
    getElementById: () => null,
    createElement: () => ({ id: "", textContent: "", remove() {} }),
    head: { append() {} },
    querySelector: (selector: string) => {
      if (selector === '[data-sidebar="inset"]') return inset;
      if (selector === '[data-sidebar="panel"]') return panel;
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector.includes("panel") && selector.includes("inset")) return [panel, inset];
      if (selector === '[data-sidebar="panel"]') return [panel];
      return [];
    },
  };
  const previousObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof MutationObserver;
  const stop = injectSidebarDepth(doc as unknown as Document, { chrome });
  return {
    sent,
    get frames() { return frames; },
    get cancelledFrames() { return cancelledFrames; },
    get motionListeners() { return (listeners.get("pointermove") ?? []).length + (listeners.get("wheel") ?? []).length; },
    setChrome(next: Parameters<typeof writeSidebarChrome>[1]) {
      writeSidebarChrome(doc as unknown as Document, next);
      for (const fn of listeners.get(SIDEBAR_CHROME_EVENT) ?? []) fn(new Event(SIDEBAR_CHROME_EVENT));
    },
    get blurCount() {
      return blurCount;
    },
    trigger,
    child,
    insetTarget,
    setTranslate(next: string) {
      translate = next;
    },
    setTime(next: number) {
      time = next;
    },
    sync() {
      syncSidebarDepth(doc as unknown as Document);
    },
    fire(type: string, event: Record<string, unknown>) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event as unknown as Event);
    },
    stop() {
      stop();
      globalThis.MutationObserver = previousObserver;
    },
  };
}

describe("blurComposerCaret", () => {
  it("blurs the composer and leaves other fields alone", () => {
    const composer = releaseElement({ "data-promptbox": "" });
    let blurred = 0;
    const editor = Object.assign(releaseElement({}, composer), {
      blur() {
        blurred += 1;
      },
    });
    assert.equal(blurComposerCaret({ activeElement: editor } as unknown as Document), true);
    assert.equal(blurred, 1);
    const field = Object.assign(releaseElement({ tag: "input" }), { blur() { blurred += 1; } });
    assert.equal(blurComposerCaret({ activeElement: field } as unknown as Document), false);
    assert.equal(blurred, 1);
    assert.equal(blurComposerCaret({ activeElement: null } as unknown as Document), false);
  });
});

describe("sidebar finger release", () => {
  it("drops the composer caret when the left sidebar opens", () => {
    const harness = mountFingerHarness();
    try {
      harness.sync();
      harness.fire("pointerdown", {
        type: "pointerdown",
        button: 0,
        pointerId: 1,
        clientX: 8,
        clientY: 8,
        target: harness.trigger,
      });
      harness.fire("pointerup", {
        type: "pointerup",
        button: 0,
        pointerId: 1,
        clientX: 9,
        clientY: 8,
        target: harness.trigger,
      });
      assert.equal(harness.blurCount, 1);
      harness.setTranslate("80px");
      harness.sync();
      assert.equal(harness.blurCount, 1);

      const show = releaseElement({ tag: "button", "aria-label": "Show right panel" });
      harness.fire("pointerdown", {
        type: "pointerdown",
        button: 0,
        pointerId: 2,
        clientX: 20,
        clientY: 20,
        target: show,
      });
      harness.fire("pointerup", {
        type: "pointerup",
        button: 0,
        pointerId: 2,
        clientX: 21,
        clientY: 20,
        target: show,
      });
      assert.equal(harness.blurCount, 1);
    } finally {
      harness.stop();
    }
  });
});

describe("sidebarFingerRelease", () => {
  const rest = { side: "rest" as const, closeSent: false };
  const left = { side: "left" as const, closeSent: false };
  const right = { side: "right" as const, closeSent: false };
  const release = {
    target: "left-panel" as const,
    deltaX: 0,
    deltaY: 0,
    velocityX: 0,
    width: 300,
  };

  it("commits the same open and dismiss distances the phone shell uses", () => {
    assert.deepEqual(
      sidebarFingerRelease(rest, { ...release, target: "left-trigger", deltaX: 1, deltaY: 2 }),
      { haptics: ["open"], suppress: ["open"], settle: null },
    );
    assert.deepEqual(sidebarFingerRelease(left, { ...release, target: "left-trigger" }), {
      haptics: ["close"],
      suppress: ["close"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(right, { ...release, target: "left-trigger" }), {
      haptics: ["close", "open"],
      suppress: ["close", "open"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(rest, { ...release, target: "right-show" }), {
      haptics: ["open"],
      suppress: ["open"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(right, { ...release, target: "right-hide" }), {
      haptics: ["close"],
      suppress: ["close"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(left, { ...release, target: "left-backdrop" }), {
      haptics: ["close"],
      suppress: ["close"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(left, { ...release, deltaX: -75 }), {
      haptics: ["close"],
      suppress: ["close"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(left, { ...release, deltaX: -20 }), {
      haptics: [],
      suppress: [],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(left, { ...release, deltaX: -36, velocityX: -450 }), {
      haptics: ["close"],
      suppress: ["close"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(right, { ...release, target: "right-shelf", deltaX: 75 }), {
      haptics: ["close"],
      suppress: ["close"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(rest, { ...release, target: "inset", deltaX: 99 }), {
      haptics: ["open"],
      suppress: ["open"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(rest, { ...release, target: "inset", deltaX: 36, velocityX: 450 }), {
      haptics: ["open"],
      suppress: ["open"],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(rest, { ...release, target: "inset", deltaX: 30 }), {
      haptics: [],
      suppress: [],
      settle: "rest",
    });
    assert.deepEqual(sidebarFingerRelease(rest, { ...release, target: "inset", deltaX: 30, deltaY: 40 }), {
      haptics: [],
      suppress: [],
      settle: null,
    });
    assert.deepEqual(sidebarFingerRelease(left, { ...release, target: "other" }), {
      haptics: [],
      suppress: [],
      settle: null,
    });
  });

  it("names the control under the finger", () => {
    const show = releaseElement({ tag: "button", "aria-label": "Show right panel" });
    const icon = releaseElement({ "data-icon": "PanelRight" }, show);
    const hide = releaseElement({ tag: "button", "aria-label": "Hide right panel (Mod+B)" });
    assert.equal(readReleaseTarget(icon), "right-show");
    assert.equal(readReleaseTarget(hide), "right-hide");
    assert.equal(readReleaseTarget(releaseElement({ tag: "button", "data-sidebar": "trigger" })), "left-trigger");
    assert.equal(readReleaseTarget(releaseElement({ tag: "input" })), "other");
    assert.equal(
      readReleaseTarget(releaseElement({}, releaseElement({ "data-sidebar": "panel" }))),
      "left-panel",
    );
    assert.equal(readReleaseTarget(releaseElement({ "data-sidebar": "inset" })), "inset");
    assert.equal(
      readReleaseTarget(releaseElement({ "data-sidebar-mobile-backdrop": "" })),
      "left-backdrop",
    );
    assert.equal(
      readReleaseTarget(releaseElement({ "data-testid": "secondary-panel-shelf-dismiss" })),
      "right-dismiss",
    );
  });
});

describe("nextSidebarPhase", () => {
  const rest = { side: "rest" as const, closeSent: false };

  it("pulses when either side opens and when it closes", () => {
    const leftOpen = nextSidebarPhase(rest, {
      translateX: 40,
      sidebarShelf: null,
      panelShelf: "closed",
    });
    assert.deepEqual(leftOpen.haptics, ["open"]);
    const leftClose = nextSidebarPhase(leftOpen.phase, {
      translateX: 0,
      sidebarShelf: "closed",
      panelShelf: "closed",
    });
    assert.deepEqual(leftClose.haptics, ["close"]);

    const rightOpen = nextSidebarPhase(rest, {
      translateX: 0,
      sidebarShelf: "closed",
      panelShelf: "shelf",
    });
    assert.deepEqual(rightOpen.haptics, ["open"]);
    assert.equal(rightOpen.phase.side, "right");
    const rightClose = nextSidebarPhase(rightOpen.phase, {
      translateX: -200,
      sidebarShelf: null,
      panelShelf: "closed",
    });
    assert.deepEqual(rightClose.haptics, ["close"]);
    const rightSettled = nextSidebarPhase(rightClose.phase, {
      translateX: 0,
      sidebarShelf: null,
      panelShelf: "closed",
    });
    assert.deepEqual(rightSettled.haptics, []);
    assert.equal(rightSettled.phase.side, "rest");
  });
});

describe("applyChatScreen", () => {
  it("rounds the chat while it is pushed and asks for one haptic", () => {
    const inset = {
      dataset: {} as Record<string, string | undefined>,
      getAttribute: (name: string) => (name === "data-panel-shelf" ? "closed" : null),
    };
    const element = inset as unknown as HTMLElement;
    assert.equal(applyChatScreen(element, 0), null);
    assert.equal(inset.dataset.bbMotionScreen, undefined);
    assert.equal(applyChatScreen(element, 80), "push");
    assert.equal(inset.dataset.bbMotionScreen, "");
    assert.equal(applyChatScreen(element, 120), null);
    assert.equal(applyChatScreen(element, 0), null);
    assert.equal(inset.dataset.bbMotionScreen, undefined);
  });

  it("keeps the radius while a shelf is open even if translate reads zero", () => {
    const inset = {
      dataset: {} as Record<string, string | undefined>,
      getAttribute: (name: string) => (name === "data-sidebar-shelf" ? "open" : null),
    };
    assert.equal(applyChatScreen(inset as unknown as HTMLElement, 0), "push");
    assert.equal(inset.dataset.bbMotionScreen, "");
  });
});

describe("isRightPanelTabPress", () => {
  it("buzzes a right-panel tab and skips close buttons and other pills", () => {
    const group = releaseElement({ "aria-label": "Right panel views" });
    const tab = releaseElement({ tag: "button", "aria-pressed": "false" }, group);
    const label = releaseElement({}, tab);
    const close = releaseElement({ tag: "button", "aria-label": "Close Notes", "data-tab-pill-close": "" }, tab);
    const outsideClose = releaseElement({ tag: "button", "data-tab-pill-close": "" });
    const elsewhere = releaseElement({ tag: "button", "aria-pressed": "true" });
    const plus = releaseElement({ tag: "button", "data-panel-new-tab": "" }, group);
    const previous = releaseElement({ tag: "button", "aria-label": "Previous tab" }, group);
    const next = releaseElement({ tag: "button", "aria-label": "Next tab", disabled: "" }, group);
    assert.equal(isRightPanelTabPress(label), true);
    assert.equal(isRightPanelTabPress(close), true);
    assert.equal(isRightPanelTabPress(outsideClose), false);
    assert.equal(isRightPanelTabPress(elsewhere), false);
    assert.equal(isRightPanelTabPress(plus), true);
    assert.equal(isRightPanelTabPress(previous), true);
    assert.equal(isRightPanelTabPress(next), false);
    assert.equal(isRightPanelTabPress(null), false);
  });
});

describe("right-panel launcher presses", () => {
  it("matches every action row, including built-in and plugin actions", () => {
    const actions = releaseElement({ "data-testid": "new-tab-actions" });
    for (const id of ["file-search-result-open-browser", "file-search-result-start-terminal", "plugin-action:codes:files", "plugin-action:notes:open"]) {
      const button = releaseElement({ tag: "button", id }, actions);
      assert.equal(isRightPanelLauncherPress(releaseElement({}, button)), true);
    }
    assert.equal(isRightPanelLauncherPress(releaseElement({ tag: "button", id: "file-search-result-start-terminal", disabled: "" }, actions)), false);
    assert.equal(isRightPanelLauncherPress(releaseElement({ tag: "button", "aria-label": "Reorder Codes" }, actions)), false);
    assert.equal(isRightPanelLauncherPress(releaseElement({ tag: "button", id: "terminal-settings" }, actions)), false);
    assert.equal(isRightPanelLauncherPress(releaseElement({ tag: "button", id: "plugin-action:codes:files" })), false);
    assert.equal(isRightPanelLauncherPress(null), false);
  });

  it("matches recent files and search results but skips other lists and controls", () => {
    const list = releaseElement({ role: "listbox", "aria-label": "File search results" });
    for (const id of ["recent-file-1", "file-search-result-1"]) {
      const row = releaseElement({ tag: "button", role: "option", id }, list);
      assert.equal(isRightPanelLauncherPress(releaseElement({}, row)), true);
    }
    assert.equal(isRightPanelLauncherPress(releaseElement({ tag: "button", "aria-expanded": "false" }, list)), false);
    const otherList = releaseElement({ role: "listbox", "aria-label": "Models" });
    assert.equal(isRightPanelLauncherPress(releaseElement({ tag: "button", role: "option" }, otherList)), false);
  });

  it("buzzes once on row activation, stays quiet on pointer release, and removes its listener", () => {
    const harness = mountFingerHarness();
    const actions = releaseElement({ "data-testid": "new-tab-actions" });
    const row = releaseElement({ tag: "button", id: "plugin-action:notes:open" }, actions);
    try {
      harness.fire("pointerup", { type: "pointerup", target: row });
      assert.deepEqual(harness.sent, []);
      harness.fire("click", { type: "click", target: row });
      assert.deepEqual(harness.sent, [{ type: "haptic", kind: "impact-light" }]);
      harness.fire("click", { type: "click", target: row });
      assert.equal(harness.sent.length, 1);
    } finally {
      harness.stop();
    }
    harness.setTime(1000);
    harness.fire("click", { type: "click", target: row });
    assert.equal(harness.sent.length, 1);
  });
});

describe("rightPanelTabSwipe", () => {
  it("names a horizontal tab change and ignores a short or vertical move", () => {
    assert.equal(rightPanelTabSwipe({ x: 80, y: 10 }, { x: 40, y: 12 }), "next");
    assert.equal(rightPanelTabSwipe({ x: 40, y: 10 }, { x: 80, y: 12 }), "previous");
    assert.equal(rightPanelTabSwipe({ x: 40, y: 10 }, { x: 60, y: 12 }), null);
    assert.equal(rightPanelTabSwipe({ x: 40, y: 10 }, { x: 80, y: 80 }), null);
    assert.equal(rightPanelTabSwipe(null, { x: 80, y: 12 }), null);
  });
});

describe("postSlideHaptic", () => {
  it("posts one light impact only when the phone bridge allows it", () => {
    const sent: unknown[] = [];
    assert.equal(postSlideHaptic(null), false);
    assert.equal(
      postSlideHaptic({ post: (message) => sent.push(message), capabilities: ["share"] }),
      false,
    );
    assert.equal(sent.length, 0);
    assert.equal(
      postSlideHaptic({ post: (message) => sent.push(message), capabilities: ["haptic"] }),
      true,
    );
    assert.deepEqual(sent, [{ type: "haptic", kind: "impact-light" }]);
    assert.equal(
      postSlideHaptic({ post: (message) => sent.push(message), capabilities: ["haptic"] }, "selection"),
      true,
    );
    assert.deepEqual(sent[1], { type: "haptic", kind: "selection" });
    assert.equal(slideHapticKind("left"), "impact-light");
    assert.equal(slideHapticKind("right"), "impact-light");
  });
});

describe("sidebarDepthCss", () => {
  it("preserves phone effects and keeps them out of desktop", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const phone = { ...PHONE_CHROME, orientation };
      const css = sidebarDepthCss(phone);
      assert.match(css, /bb-sidebar-phone-shelf \*\/\s*@media all/);
      assertPhoneStyles(css);
      assert.equal(sidebarDepthCss({ ...phone, device: "desktop" }), "");
    }
    const landscape = { ...PHONE_CHROME, orientation: "landscape", viewport: "medium" } as const;
    assert.match(sidebarDepthCss(landscape), /bb-sidebar-phone-shelf \*\/\s*@media not all/);
  });
});

describe("injectSidebarDepth", () => {
  it("runs geometry sampling only on phone and stops it when device chrome changes", () => {
    const desktop = { ...PHONE_CHROME, device: "desktop" } as const;
    const harness = mountFingerHarness(desktop);
    try {
      assert.equal(harness.frames, 0);
      assert.equal(harness.motionListeners, 0);
      harness.setChrome(PHONE_CHROME);
      assert.equal(harness.frames, 1);
      assert.ok(harness.motionListeners > 0);
      harness.setChrome(desktop);
      assert.equal(harness.cancelledFrames, 1);
      assert.equal(harness.motionListeners, 0);
      harness.fire("pointermove", { type: "pointermove" });
      harness.fire("wheel", { type: "wheel" });
      assert.equal(harness.frames, 1);
    } finally {
      harness.stop();
    }
  });

  it("writes the phone position-driven stylesheet and removes it on cleanup", () => {
    const nodes: { id: string; textContent: string }[] = [];
    const doc = {
      getElementById: (id: string) => nodes.find((node) => node.id === id) ?? null,
      createElement: () => {
        const node = {
          id: "",
          textContent: "",
          remove() {
            const index = nodes.indexOf(node);
            if (index >= 0) nodes.splice(index, 1);
          },
        };
        return node;
      },
      head: {
        append(node: { id: string }) {
          nodes.push(node as { id: string; textContent: string });
        },
      },
      querySelectorAll: () => [],
    };
    const stop = injectSidebarDepth(doc as unknown as Document, { chrome: PHONE_CHROME });
    assert.equal(nodes.length, 1);
    assert.match(nodes[0].textContent, /--lite-sidebar-depth/);
    assert.match(nodes[0].textContent, /--bb-motion-right-depth/);
    assert.match(nodes[0].textContent, /720ms/);
    assert.doesNotMatch(nodes[0].textContent, /transform 420ms/);
    assert.doesNotMatch(nodes[0].textContent, /bb-sidebar-desktop-card/);
    assert.match(nodes[0].textContent, /bb-sidebar-phone-shelf/);
    stop();
    assert.equal(nodes.length, 0);
  });

  it("ignores the removed card preference and keeps the device lifecycle active", () => {
    const values = new Map<string, string>([["sidebar:desktop-layout", "off"]]);
    const listeners = new Map<string, (event: Event) => void>();
    const nodes: { id: string; textContent: string }[] = [];
    const doc = {
      getElementById: (id: string) => nodes.find((node) => node.id === id) ?? null,
      createElement: () => {
        const node = {
          id: "",
          textContent: "",
          remove() {
            const index = nodes.indexOf(node);
            if (index >= 0) nodes.splice(index, 1);
          },
        };
        return node;
      },
      head: {
        append(node: { id: string }) {
          nodes.push(node as { id: string; textContent: string });
        },
      },
      defaultView: {
        localStorage: {
          getItem: (name: string) => values.get(name) ?? null,
          setItem: (name: string, value: string) => values.set(name, value),
        },
        addEventListener: (type: string, listener: (event: Event) => void) => {
          listeners.set(type, listener);
        },
        removeEventListener: (type: string) => {
          listeners.delete(type);
        },
      },
      querySelectorAll: () => [],
    };
    const stop = injectSidebarDepth(doc as unknown as Document, { pluginId: "sidebar" });
    assert.equal(nodes[0]?.textContent, "");
    writeSidebarChrome(doc as unknown as Document, PHONE_CHROME);
    listeners.get(SIDEBAR_CHROME_EVENT)?.(new Event(SIDEBAR_CHROME_EVENT));
    assert.match(nodes[0]?.textContent ?? "", /bb-sidebar-phone-shelf \*\/\s*@media all/);
    writeSidebarChrome(doc as unknown as Document, { ...PHONE_CHROME, device: "desktop", viewport: "wide" });
    listeners.get(SIDEBAR_CHROME_EVENT)?.(new Event(SIDEBAR_CHROME_EVENT));
    assert.equal(nodes[0]?.textContent, "");
    const other = new Event("bb-sidebar-desktop-layout");
    Object.assign(other, { detail: { pluginId: "other", enabled: true } });
    listeners.get("bb-sidebar-desktop-layout")?.(other);
    assert.doesNotMatch(nodes[0]?.textContent ?? "", /bb-sidebar-desktop-card/);
    const event = new Event("bb-sidebar-desktop-layout");
    Object.assign(event, { detail: { pluginId: "sidebar", enabled: true } });
    listeners.get("bb-sidebar-desktop-layout")?.(event);
    assert.doesNotMatch(nodes[0]?.textContent ?? "", /bb-sidebar-desktop-card/);
    assert.equal(listeners.has("bb-sidebar-desktop-layout"), false);
    stop();
    assert.equal(listeners.size, 0);
  });
});
