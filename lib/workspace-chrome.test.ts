import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { mountWorkspaceChrome } from "./workspace-chrome.ts";
import { WORKSPACE_PREFERENCES_EVENT } from "./workspaces.ts";

function page() { return new JSDOM('<div data-app-content-shell></div><nav aria-label="Primary navigation"><button id="plugin">Issues</button></nav><div data-sidebar="sidebar"><a data-sidebar-thread-id="t" href="#">Thread</a></div>', { url: "https://bb.test/" }); }
const turn=()=>new Promise(resolve=>setTimeout(resolve,140));

test("mount creates one default tab and disposal leaves native history intact", () => {
 const dom=page(),doc=dom.window.document,push=dom.window.history.pushState;
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 assert.equal(doc.querySelectorAll('[role="tab"]').length,1);
 assert.equal(doc.querySelector('[role="tab"]')?.textContent,"기본");
 assert.equal(doc.querySelector<HTMLButtonElement>('[data-workspace-close]')?.disabled,true);
 stop();assert.equal(doc.querySelector('[data-sidebar-workspaces]'),null);assert.equal(dom.window.history.pushState,push);dom.window.close();
});
test("desktop titlebar keeps workspace tabs before the native right-panel toggle", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.body.insertAdjacentHTML("beforeend",'<div data-testid="app-window-title-bar"><button id="left">Left</button><div id="right"><button data-testid="window-right-panel-toggle">Right</button></div></div>');
 const titlebar=doc.querySelector('[data-testid="app-window-title-bar"]')!,right=doc.getElementById("right")!;
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 t.after(()=>{stop();dom.window.close();});
 const bar=doc.querySelector('[data-sidebar-workspace-bar]')!;
 assert.equal(bar.nextElementSibling,right);
 stop();assert.deepEqual(Array.from(titlebar.children).map(e=>e.id),["left","right"]);
});
test("a remounted native titlebar control stays after the workspace tabs", async (t) => {
 const dom=page(),doc=dom.window.document;
 doc.body.insertAdjacentHTML("beforeend",'<div data-testid="app-window-title-bar"><button>Left</button></div>');
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 t.after(()=>{stop();dom.window.close();});
 const bar=doc.querySelector('[data-sidebar-workspace-bar]')!;
 const right=doc.createElement("div");right.innerHTML='<button data-testid="window-right-panel-toggle">Right</button>';
 bar.before(right);
 await new Promise(resolve=>setTimeout(resolve,550));
 assert.equal(bar.nextElementSibling,right);
});
test("left navigation delegates splits to the host without reload or native storage writes", async (t) => {
 const dom=page(),doc=dom.window.document,push=dom.window.history.pushState;
 const original=doc.createElement("div");doc.querySelector('[data-app-content-shell]')!.append(original);
 const native=JSON.stringify({version:1,layout:{root:{type:"pane",paneId:"p1",content:{kind:"thread",projectId:"p",threadId:"first"}},focusedPaneId:"p1"}});
 dom.window.sessionStorage.setItem("bb.splitLayout",native);
 const navigations:string[]=[];
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:r=>navigations.push(r)});
 t.after(()=>{stop();dom.window.close();});
 const clicks:boolean[]=[];
 const targets=[doc.querySelector<HTMLButtonElement>('#plugin')!,doc.querySelector<HTMLAnchorElement>('a')!];
 targets.forEach((target,i)=>target.addEventListener("click",event=>{
  event.preventDefault();clicks.push(event.metaKey || event.ctrlKey);
  dom.window.history.pushState(null,"",i===0?"/plugins/issues/tasks/all":"/projects/p/threads/t");
 }));
 for(const target of targets){target.click();await turn();}
 assert.deepEqual(clicks,[true,true],"plain clicks must use the native split handler");
 assert.deepEqual(navigations,[],"opening a pane must never restore the whole app");
 assert.equal(dom.window.sessionStorage.getItem("bb.splitLayout"),native);
 assert.equal(dom.window.history.pushState,push);
 assert.equal(original.isConnected,true);
});
test("replace mode and explicit modifiers keep the original native click", (t) => {
 const dom=page(),doc=dom.window.document;
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>assert.fail("must not reload")});
 t.after(()=>{stop();dom.window.close();});
 dom.window.dispatchEvent(new dom.window.CustomEvent(WORKSPACE_PREFERENCES_EVENT,{detail:{pluginId:"sidebar",openMode:"replace"}}));
 const events:MouseEvent[]=[];const target=doc.querySelector<HTMLButtonElement>('#plugin')!;
 target.addEventListener("click",event=>events.push(event));
 const plain=new dom.window.MouseEvent("click",{bubbles:true,cancelable:true});target.dispatchEvent(plain);
 const modified=new dom.window.MouseEvent("click",{bubbles:true,cancelable:true,ctrlKey:true});target.dispatchEvent(modified);
 assert.equal(events.length,2);assert.equal(events[0],plain);assert.equal(events[1],modified);
});
test("new-thread clicks split while sidebar utilities and page controls remain untouched", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.querySelector('[data-sidebar="sidebar"]')!.insertAdjacentHTML("beforeend",'<button aria-label="New thread (⌘ O)"><span id="new-icon">+</span></button><a id="settings" href="/settings">Settings</a>');
 doc.querySelector('[data-app-content-shell]')!.innerHTML='<button id="outside">Control</button>';
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>assert.fail("must not reload")});
 t.after(()=>{stop();dom.window.close();});
 const clicks:boolean[]=[];
 for(const id of ['new-icon','settings','outside']){
  const target=doc.getElementById(id)!;target.addEventListener("click",e=>{e.preventDefault();clicks.push(Reflect.get(e,"metaKey")===true);});target.click();
 }
 assert.deepEqual(clicks,[true,false,false]);
});
test("the pane limit never replaces existing content through a plain click", (t) => {
 const dom=page(),doc=dom.window.document;
 const panes=Array.from({length:8},(_,i)=>({type:"pane",paneId:`p${i}`,content:{kind:"new-thread"}}));
 const native=JSON.stringify({version:1,layout:{root:{type:"split",dir:"row",sizes:panes.map(()=>1/8),children:panes},focusedPaneId:"p0"}});
 dom.window.sessionStorage.setItem("bb.splitLayout",native);
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>assert.fail("must not reload")});
 t.after(()=>{stop();dom.window.close();});
 let nativeClicks=0;doc.querySelector('#plugin')!.addEventListener("click",()=>nativeClicks++);
 doc.querySelector<HTMLButtonElement>('#plugin')!.click();
 assert.equal(nativeClicks,0);
 assert.match(doc.querySelector('[role="status"]')!.textContent!,/8개/);
 assert.equal(dom.window.sessionStorage.getItem("bb.splitLayout"),native);
});
test("the first page fills an empty workspace without adding a compose pane beside it", (t) => {
 const dom=page(),doc=dom.window.document;
 dom.window.sessionStorage.setItem("bb.splitLayout",JSON.stringify({version:1,layout:{root:{type:"pane",paneId:"empty",content:{kind:"new-thread"}},focusedPaneId:"empty"}}));
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>assert.fail("must not reload")});
 t.after(()=>{stop();dom.window.close();});
 const events:MouseEvent[]=[];const target=doc.querySelector<HTMLButtonElement>('#plugin')!;
 target.addEventListener("click",event=>events.push(event));
 const click=new dom.window.MouseEvent("click",{bubbles:true,cancelable:true});target.dispatchEvent(click);
 assert.equal(events.length,1);assert.equal(events[0],click);
});
test("new workspace is empty and the old workspace restores after a client remount", () => {
 const dom=page(),doc=dom.window.document,navigations:string[]=[];
 dom.window.history.replaceState(null,"","/plugins/issues/tasks/all");
 let stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:r=>navigations.push(r)});
 doc.querySelector<HTMLButtonElement>('[aria-label="새 워크스페이스"]')?.click();assert.equal(navigations.at(-1),"/");
 stop();dom.reconfigure({url:"https://bb.test/"});stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:r=>navigations.push(r)});
 const original=Array.from(doc.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(b=>b.textContent==="기본");original?.click();
 assert.equal(navigations.at(-1),"/plugins/issues/tasks/all");stop();dom.window.close();
});

test("phone never mounts workspace tabs or changes navigation and storage", (t) => {
 const dom=page(),doc=dom.window.document,push=dom.window.history.pushState;
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"phone",navigate:()=>assert.fail("mobile must not navigate")});
 t.after(()=>{stop();dom.window.close();});
 assert.equal(doc.querySelector('[data-sidebar-workspaces]'),null);
 assert.equal(doc.querySelector('[data-sidebar-workspace-style]'),null);
 assert.equal(doc.querySelector('[data-sidebar-pane-drag-style]'),null);
 assert.equal(dom.window.history.pushState,push);
 assert.equal(dom.window.sessionStorage.length,0);stop();dom.window.close();
});

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
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
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
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
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
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 t.after(()=>{stop();dom.window.close();});
 for(const surface of doc.querySelectorAll('[data-surface]')) assert.equal(dom.window.getComputedStyle(surface).backgroundColor,"rgba(0, 0, 0, 0)",surface.outerHTML.slice(0,100));
 assert.deepEqual(controls.map(e=>dom.window.getComputedStyle(e).backgroundColor),before);
});

test("desktop at phone width retains workspace tabs", (t) => {
 const dom=page(),doc=dom.window.document;
 Object.defineProperty(dom.window,"innerWidth",{value:390});
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 t.after(()=>{stop();dom.window.close();});
 assert.equal(doc.querySelectorAll('[data-sidebar-workspaces]').length,1);
});

test("desktop clears the native inset and content shell backgrounds", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.body.innerHTML='<style>[data-sidebar="inset"],[data-app-content-shell]{background:white}</style><main data-sidebar="inset"><div data-app-content-shell></div></main>';
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 t.after(()=>{stop();dom.window.close();});
 for(const e of doc.querySelectorAll('[data-sidebar="inset"],[data-app-content-shell]')) assert.equal(dom.window.getComputedStyle(e).backgroundColor,"rgba(0, 0, 0, 0)");
});

test("desktop preserves native sidebar transitions while pane geometry stays instant", (t) => {
 const dom=page(),doc=dom.window.document;
 doc.head.innerHTML='<style>[data-layout-motion] { transition:width .72s, flex-grow .22s, opacity .22s; } button { transition:background-color .15s; }</style>';
 doc.body.innerHTML=`<div data-sidebar="gap" data-layout-motion></div>
 <div data-sidebar="panel" data-layout-motion><div data-sidebar="collapsible-body" data-layout-motion></div></div>
 <main data-sidebar="inset" data-layout-motion><div data-app-content-shell>
  <div data-split-resize-grid-root style="--panel-collapse-duration:220ms">
   <div data-panel data-layout-motion><div data-split-pane-id="chat" data-layout-motion><button>Composer</button></div></div>
   <div data-panel-resize-handle-id="resize" data-layout-motion></div>
   <div data-panel data-layout-motion><aside><div data-split-pane-id="plugin" data-layout-motion></div></aside></div>
  </div>
 </div></main>`;
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 t.after(()=>{stop();dom.window.close();});
 for(const element of doc.querySelectorAll('[data-layout-motion]:not([data-split-pane-id])')) assert.equal(dom.window.getComputedStyle(element).transition,"width .72s, flex-grow .22s, opacity .22s",element.outerHTML.slice(0,100));
 for(const element of doc.querySelectorAll('[data-split-pane-id]')) assert.equal(dom.window.getComputedStyle(element).transition,"none");
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-split-resize-grid-root]')!).getPropertyValue("--panel-collapse-duration"),"220ms");
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-split-pane-id] button')!).transition,"background-color .15s");
});
