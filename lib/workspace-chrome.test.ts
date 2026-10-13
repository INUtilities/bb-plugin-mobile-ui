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
 <div data-split-pane-id="right"><section>Right panel</section><div data-pane-focus-scrim class="focus-dim"></div></div>`;
 const scrims=Array.from(doc.querySelectorAll<HTMLElement>('[data-pane-focus-scrim]'));
 const before=scrims.map(e=>dom.window.getComputedStyle(e).backgroundColor);
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 t.after(()=>{stop();dom.window.close();});
 assert.deepEqual(scrims.map(e=>dom.window.getComputedStyle(e).backgroundColor),before);
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-split-pane-id] > section')!).borderRadius,"18px");
 assert.equal(dom.window.getComputedStyle(doc.querySelector('[data-app-content-shell]')!).backgroundColor,"rgba(0, 0, 0, 0)");
});

test("desktop at phone width retains workspace tabs", (t) => {
 const dom=page(),doc=dom.window.document;
 Object.defineProperty(dom.window,"innerWidth",{value:390});
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 t.after(()=>{stop();dom.window.close();});
 assert.equal(doc.querySelectorAll('[data-sidebar-workspaces]').length,1);
});
