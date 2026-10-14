import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { mountSidebarCards } from "./sidebar-cards.ts";
function page() { return new JSDOM('<div data-app-content-shell></div>', { url: "https://bb.test/" }); }
// 네이티브 페인은 콘텐츠와 포커스 scrim을 형제로 렌더한다.
// 두 요소에 같은 배경을 칠하면 채팅이 존재해도 화면에서 가려진다.
test("pane surfaces preserve the native transparent focus overlay", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.querySelector('[data-app-content-shell]')!.innerHTML=`
 <style>.focus-clear{background:transparent}.focus-dim{background:rgba(0,0,0,.3)}</style>
 <div data-split-pane-id="chat" data-focused="true"><div data-content>Chat</div><div data-pane-focus-scrim class="focus-clear" style="position:absolute;inset:0"></div></div>
 <div data-split-pane-id="right" data-focused="false" style="position:absolute"><section>Right panel</section><div data-pane-focus-scrim class="focus-dim"></div></div>`;
 const scrims=Array.from(doc.querySelectorAll<HTMLElement>('[data-pane-focus-scrim]'));
 const before=scrims.map(e=>dom.window.getComputedStyle(e).backgroundColor);
 const stop=mountSidebarCards(doc,{pluginId:"sidebar",device:"desktop"});
 t.after(()=>{stop();dom.window.close();});
 assert.deepEqual(scrims.map(e=>dom.window.getComputedStyle(e).backgroundColor),before);
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-split-pane-id] > section')!).borderRadius,"18px");
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-split-pane-id="right"]')!).position,"absolute");
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-app-content-shell]')!).backgroundColor,"rgba(0, 0, 0, 0)");
});

test("active pane titles lose their fill while selected controls retain theirs", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.querySelector('[data-app-content-shell]')!.innerHTML='<style>.selected{background:rgb(60,60,76)}</style><div data-split-pane-id="active" data-focused="true"><header><div data-pane-header-focus-tab class="selected">Title</div><button class="selected">Selected action</button></header></div>';
 const button=doc.querySelector('header button')!,before=dom.window.getComputedStyle(button).backgroundColor;
 const stop=mountSidebarCards(doc,{pluginId:"sidebar",device:"desktop"});
 t.after(()=>{stop();dom.window.close();});
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-pane-header-focus-tab]')!).backgroundColor,"rgba(0, 0, 0, 0)");
 assert.equal(dom.window.getComputedStyle(button).backgroundColor,before);
});

test("pane shells are transparent without clearing controls or content cards", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.querySelector('[data-app-content-shell]')!.innerHTML=`
 <style>.surface{background:rgb(30,30,46)}.control{background:rgb(60,60,76)}</style>
 <div data-split-pane-id="single">
  <header class="surface" data-surface><div data-testid="app-page-header-content-row"></div></header>
  <div data-thread-window class="surface" data-surface><form class="control"><button class="control">Send</button></form><div data-bb-plugin-root><div class="control">Message widget</div></div></div>
 </div>
 <div data-split-pane-id="plugin" data-focused="true"><div class="surface" data-surface>
  <div data-pane-content><div data-bb-plugin-root><main class="surface" data-surface>
   <header class="surface" data-surface>Page header</header>
   <article class="control"><header class="control">Card title</header></article>
  </main></div></div>
 </div></div>
 <div data-panel><aside class="surface" data-surface><div>
  <div class="surface" data-surface>Tabs</div>
  <div class="surface" data-surface><div data-bb-plugin-root><section class="surface" data-surface><button class="control">Selected tab</button></section></div></div>
 </div></aside></div>
 <div data-split-pane-id="right-split" data-focused="false"><section class="surface" data-surface>
  <div class="surface" data-surface>Split toolbar</div><div class="surface" data-surface>Split content</div>
 </section></div>`;
 const controls=Array.from(doc.querySelectorAll('.control'));
 const before=controls.map(e=>dom.window.getComputedStyle(e).backgroundColor);
 const stop=mountSidebarCards(doc,{pluginId:"sidebar",device:"desktop"});
 t.after(()=>{stop();dom.window.close();});
 for(const surface of doc.querySelectorAll('[data-surface]')) assert.equal(dom.window.getComputedStyle(surface).backgroundColor,"rgba(0, 0, 0, 0)",surface.outerHTML.slice(0,100));
 assert.deepEqual(controls.map(e=>dom.window.getComputedStyle(e).backgroundColor),before);
});

test("desktop clears the native inset and content shell backgrounds", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.body.innerHTML='<style>[data-sidebar="inset"],[data-app-content-shell]{background:white}</style><main data-sidebar="inset"><div data-app-content-shell></div></main>';
 const stop=mountSidebarCards(doc,{pluginId:"sidebar",device:"desktop"});
 t.after(()=>{stop();dom.window.close();});
 for(const e of doc.querySelectorAll('[data-sidebar="inset"],[data-app-content-shell]')) assert.equal(dom.window.getComputedStyle(e).backgroundColor,"rgba(0, 0, 0, 0)");
});

test("desktop shares sidebar timing while native transition properties and pane geometry stay intact", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.head.innerHTML='<style>[data-layout-motion] { transition:width .72s, flex-grow .22s, opacity .22s; } [data-split-resize-grid-root] { --panel-collapse-duration:220ms; } button { transition:background-color .15s; }</style>';
 doc.body.innerHTML=`<div data-sidebar="gap" data-layout-motion></div>
 <div data-sidebar="panel" data-layout-motion><div data-sidebar="collapsible-body" data-layout-motion></div></div>
 <main data-sidebar="inset" data-layout-motion><div data-app-content-shell>
  <div data-split-resize-grid-root data-panel-group>
   <div data-panel data-layout-motion><div data-split-pane-id="chat" data-layout-motion><button>Composer</button></div></div>
   <div data-panel-resize-handle-id="resize" data-layout-motion></div>
   <div data-panel data-layout-motion><aside><div data-split-pane-id="plugin" data-layout-motion></div></aside></div>
  </div>
 </div></main>`;
 const stop=mountSidebarCards(doc,{pluginId:"sidebar",device:"desktop"});
 t.after(()=>{stop();dom.window.close();});
 for(const element of doc.querySelectorAll('[data-layout-motion]:not([data-split-pane-id], [data-sidebar="gap"], [data-sidebar="panel"])')) assert.equal(dom.window.getComputedStyle(element).transition,"width .72s, flex-grow .22s, opacity .22s",element.outerHTML.slice(0,100));
 assert.match(dom.window.getComputedStyle(doc.querySelector('[data-sidebar="gap"]')!).transition, /^width 320ms cubic-bezier/);
 assert.match(dom.window.getComputedStyle(doc.querySelector('[data-sidebar="panel"]')!).transition, /width 320ms cubic-bezier/);
 for(const element of doc.querySelectorAll('[data-split-pane-id]')) assert.equal(dom.window.getComputedStyle(element).transition,"none");
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-split-resize-grid-root]')!).getPropertyValue("--panel-collapse-duration"),"320ms");
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-split-pane-id] button')!).transition,"background-color .15s");
});

test("Sidebar alone has cards but no workspace UI, settings or click policy", t => {
 const dom=page(),doc=dom.window.document;
 const stop=mountSidebarCards(doc,{device:"desktop"});t.after(()=>{stop();dom.window.close();});
 assert.ok(doc.querySelector('[data-sidebar-cards-style]'));assert.equal(doc.querySelector('[role=tab]'),null);assert.equal(dom.window.sessionStorage.length,0);
});
test("phone never receives desktop cards and duplicate mounts clean up once", t => {
 const dom=page(),doc=dom.window.document;const phone=mountSidebarCards(doc,{device:"phone"});phone();assert.equal(doc.querySelector('style'),null);
 const a=mountSidebarCards(doc,{device:"desktop"}),b=mountSidebarCards(doc,{device:"desktop"});t.after(()=>{a();b();dom.window.close();});
 assert.equal(doc.querySelectorAll('[data-sidebar-cards-style]').length,1);a();a();assert.ok(doc.querySelector('style'));b();assert.equal(doc.querySelector('style'),null);
});
