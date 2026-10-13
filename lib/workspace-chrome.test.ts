import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { mountWorkspaceChrome } from "./workspace-chrome.ts";
import { readNativeLayout, WORKSPACE_PREFERENCES_EVENT } from "./workspaces.ts";

function page() { return new JSDOM('<div data-app-content-shell></div><nav aria-label="Primary navigation"><button id="plugin">Issues</button></nav><div data-sidebar="sidebar"><a data-sidebar-thread-id="t" href="#">Thread</a></div>', { url: "https://bb.test/" }); }
function countPanes(value: ReturnType<typeof readNativeLayout>): number { if (!value) return 0; const walk=(n: typeof value.root): number=>n.type==="pane"?1:n.children.reduce((s,c)=>s+walk(c),0);return walk(value.root); }
const turn=()=>new Promise(resolve=>setTimeout(resolve,140));

test("mount creates one default tab and disposal removes chrome and history interception", () => {
 const dom=page(),doc=dom.window.document,push=dom.window.history.pushState;
 const stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:()=>{}});
 assert.equal(doc.querySelectorAll('[role="tab"]').length,1);
 assert.equal(doc.querySelector('[role="tab"]')?.textContent,"기본");
 assert.equal(doc.querySelector<HTMLButtonElement>('[data-workspace-close]')?.disabled,true);
 stop();assert.equal(doc.querySelector('[data-sidebar-workspaces]'),null);assert.equal(dom.window.history.pushState,push);dom.window.close();
});
test("left ribbon navigation follows new-pane and replace preferences using native snapshots", async () => {
 const dom=page(),doc=dom.window.document,navigations:string[]=[];
 let stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:r=>navigations.push(r)});
 doc.querySelector<HTMLButtonElement>('#plugin')?.click();dom.window.history.pushState(null,"","/plugins/issues/tasks/all");await turn();
 assert.deepEqual(navigations,["/plugins/issues/tasks/all"]);
 assert.equal(countPanes(readNativeLayout(dom.window.sessionStorage.getItem("bb.splitLayout"))),1);
 stop();stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:r=>navigations.push(r)});
 doc.querySelector<HTMLAnchorElement>('a')?.addEventListener('click', e=>e.preventDefault());
 doc.querySelector<HTMLAnchorElement>('a')?.click();dom.window.history.pushState(null,"","/projects/p/threads/t");await turn();
 assert.equal(countPanes(readNativeLayout(dom.window.sessionStorage.getItem("bb.splitLayout"))),2);
 stop();stop=mountWorkspaceChrome(doc,{pluginId:"sidebar",device:"desktop",navigate:r=>navigations.push(r)});
 dom.window.dispatchEvent(new dom.window.CustomEvent(WORKSPACE_PREFERENCES_EVENT,{detail:{pluginId:"sidebar",openMode:"replace"}}));
 doc.querySelector<HTMLButtonElement>('#plugin')?.click();dom.window.history.pushState(null,"","/plugins/vault/docs/main");await turn();
 const layout=readNativeLayout(dom.window.sessionStorage.getItem("bb.splitLayout"));
 assert.equal(countPanes(layout),2);assert.equal(navigations.at(-1),"/plugins/vault/docs/main");
 assert.ok(JSON.stringify(layout).includes('"pluginId":"vault"'));stop();dom.window.close();
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
