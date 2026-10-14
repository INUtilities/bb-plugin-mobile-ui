# 다중 workspace 탭·pane 최적화 조사

조사일: 2026-10-14. 범위: Sidebar 플러그인의 후속 최적화 후보와 BB가 제공해야 할 기반 기능. 이 문서는 조사·설계 제안이며, 성능 개선 구현이나 실제 BB desktop 성능 측정 결과가 아니다.

## 결론과 우선순위

**가장 큰 구조적 개선 후보는 workspace 전환의 앱 재초기화를 없애는 것이다.** 그 다음은 최근 workspace의 화면만 제한적으로 보존하고, 보이지 않는 화면의 구독·timer·렌더 작업을 관리하는 것이다. 현재 공개 SDK만으로 native workspace 전체를 교체하거나 React lifecycle을 관리할 수는 없다. 플러그인 안에서 가능한 작은 개선은 있지만, 큰 FPS 개선을 약속할 근거는 아직 없다.

| 순서 | 후보 | 기대 효과와 근거 | 구현 위치 | 판단 |
|---|---|---|---|---|
| 1 | 실제 desktop의 switch·입력·resize trace | 비용을 React / layout / paint / native view / network로 구분 | 계측 | 다음 구현 전에 필요 |
| 2 | 재로드 없는 전체 layout 교체와 일관된 pane mount 구조 | workspace 복귀 시 재초기화 제거, 첫 1→2 분할의 remount 감소 | BB host + 공개 SDK | 구조적 효과가 가장 유력 |
| 3 | 현재 workspace + 직전 workspace만 화면 보존, 오래된 화면 퇴출 | 빠른 왕복과 메모리 증가 사이의 절충 | BB host | 2 이후 별도 실험; 개수는 미확정 |
| 4 | 변하지 않은 배치의 parse·clone·stringify 생략 | idle CPU·할당 감소 | Sidebar | 작고 안전한 후보, 체감 효과는 낮을 수 있음 |
| 5 | provider 표시를 draft 변경 구독에서 분리 | 입력 중 무관한 표시 업데이트 감소 | Sidebar 일부 / SDK 완전 지원 | Profiler에서 비용 확인 후 |
| 6 | drag 중 내용 wrapper의 렌더 생략·표시용 작업 휴면 | 복잡한 내용의 layout·paint·JS 비용 감소 가능 | CSS 실험 / BB lifecycle 지원 | Browser·Terminal·scroll 회귀 검증 후 |

2는 앱 전체 재로드를 없애는 단계이고, 3은 이전 화면 instance까지 유지하는 단계다. 전체 layout 교체 API만 추가한다고 서로 다른 pane의 React state가 자동 보존되지는 않는다. 두 효과를 구분해 검증한다.

## 조사 기준과 로컬 근거

- Sidebar 코드: `e199447`, SDK `0.6.39`. 실행 번들 `1063a3c5b0531fd2`를 확인했다. 이번 조사는 실행 코드를 바꾸거나 reload하지 않았다.
- BB 앱 소스: `f135a001e72942cee9118d2693208ec0725e2f18`의 읽을 수 있는 Git 객체를 고정해서 조사했다. 이 소스 commit과 사용자의 실제 desktop 실행 파일이 같다는 검증은 하지 못했다.
- 실제 desktop의 trace, FPS, heap snapshot, phone·desktop 앱 캡처는 이번 조사에 없다. 아래 Node 실험을 실제 UI 측정으로 해석하지 않는다.

플러그인 근거는 [workspace-chrome.ts](../lib/workspace-chrome.ts), [workspaces.ts](../lib/workspaces.ts), [pane-drag.ts](../lib/pane-drag.ts), [app.tsx](../app.tsx), [sidebar-depth.ts](../lib/sidebar-depth.ts)다. 아래 BB 경로·줄 번호는 위 고정 commit 기준이다. SDK 근거는 설치된 `node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts`다.

### 탭 수와 페인 수는 다르게 늘어난다

**확인:** Sidebar workspace 탭에는 route·layout tree·focus·maximize 정보만 있다. 비활성 탭의 실제 채팅 DOM을 미리 마운트해 두지 않는다. 탭 선택·추가·활성 탭 닫기는 native 저장값을 쓴 뒤 `location.reload()` 또는 `location.assign()`을 사용한다. 따라서 메모리 안의 화면·cache 재사용을 전환마다 잃을 수 있다. 반면 일반 페인 추가는 native modifier-click 경로이고 플러그인 재로드가 없다. [workspace-chrome.ts](../lib/workspace-chrome.ts), [현재 복원 계약](../README.md#복원-경계)

**확인:** native `SplitThreadArea`는 단일 pane일 때 `WorkspacePaneContent`를 바로 렌더하고, 여러 pane일 때는 split wrapper/tree 안에 렌더한다. 첫 1→2 분할은 React tree 위치가 바뀌는 구조다. 단순 `memo` 추가만으로 이 mount 경계가 사라지지는 않는다. 근거: `apps/app/src/views/thread-detail/SplitThreadArea.tsx:719` 및 `:889`.

**추론:** 현재 탭 수 증가는 주로 작은 snapshot·탭 버튼 수의 증가다. 동시에 보이는 페인 수 증가는 실제 editor·timeline·plugin view 수의 증가다. 이 둘을 모두 “탭이 많아서 서버가 느려진다”로 묶으면 원인을 놓친다.

### BB가 이미 하는 최적화

| 확인한 처리 | 정확한 범위·한계 | BB 소스 근거 |
|---|---|---|
| 긴 timeline의 실제 windowing | 20개 이상, 유효 scroll root, iOS WebKit 제외 등 조건. overscan 8. 현재 desktop 실행에서 활성인지 별도 확인 필요 | `components/thread/timeline/TimelineWindowedItems.tsx:63,171`, `TimelineWindowedItemsLoader.tsx:5` |
| timeline 행·pane 내용의 memo | 모든 streaming 변경이 모든 DOM을 다시 만드는 구조라고 단정할 수 없음 | `ThreadTimelineRows.tsx:1604,1682,2283`, `SplitThreadArea.tsx:1013` |
| 최대화로 덮인 main pane | DOM 유지, `contentVisibility: hidden`, timeline query의 `enabled: false` 전달. 전체 pane의 모든 effect 정지는 아님 | `SplitThreadArea.tsx:894`, `ThreadDetailView.tsx:499,798`, `hooks/queries/thread-queries.ts:984` |
| 최대화로 덮인 right pane | absolute 배치와 `contentVisibility: hidden` | `components/secondary-panel/SidebarSplitContainer.tsx:749` |
| split resize 중 화면 밖 timeline 행 생략 | 기존 높이를 보존하고 content visibility를 숨겼다가 복구. pointer 이동 중 직접 크기를 바꾸고 종료 시 배치 commit | `SplitThreadArea.tsx:1447,1550,1578` |
| 최근 열었던 스레드 데이터 cache | GC 60분, 일반 포인터 기준 20개·coarse pointer 8개 목표. 활성 query는 퇴출에서 제외되어 엄격한 메모리 상한은 아님. DOM cache와 다름 | `hooks/cache-owners/thread-open-cache-owner.ts:10,40` |
| 같은 대상의 realtime 구독 합치기 | 하나의 `WebSocketManager`가 대상별 reference count 관리. 같은 thread에 hook이 여러 개여도 서버 subscribe를 매번 새로 보내지 않음 | `lib/ws.ts:77,401,415` |
| document 비표시 중 cache 갱신 지연 | 일부 realtime 변경을 모아 표시 복귀 시 처리. 같은 document 안에서 가려진 pane은 별도 문제 | `hooks/realtime-cache-effects.ts:381,486,501` |
| diff worker pool 필요 시 획득 | split 영역 바깥의 provider가 요청 시 로드. “페인마다 worker 하나 새로 만들기”를 해결책으로 제안할 근거 없음 | `SplitThreadArea.tsx:266`, `ThreadDetailWorkerPoolProvider.tsx:30` |

위 표의 짧은 경로는 `apps/app/src/` 아래다. 가상화·cache·최대화 숨김을 새로 구현하자는 제안은 기존 기능과 중복된다. 먼저 실제 조건에서 이 기능들이 켜져 있는지 확인해야 한다.

**추가 조사 지점:** 최대화 전 scroll 보존은 보이는 pane의 모든 하위 element를 순회해 scroll 값을 읽고, 변경 후 최대 5 frame 동안 보정한다. 큰 DOM에서는 전환 순간 비용 후보다. 아직 실제 병목으로 측정하지 않았다. BB 측에서 scroll container 등록 방식으로 범위를 좁힐 수 있는지 검토할 수 있다. 플러그인이 이 native 보정 함수를 덮어쓰지는 않는다. 근거: `SplitThreadArea.tsx:191–259`.

### 플러그인 안에서 가능한 개선

**배치 저장:** 지금은 500ms마다 native layout을 읽고 parse·검증한 뒤, 활성 snapshot을 `structuredClone`하고 모든 탭을 `JSON.stringify`한다. 저장값이 같을 때 생략하는 것은 `sessionStorage.setItem`뿐이다. raw layout·route·maximize 값이 직전과 같으면 그 앞 단계부터 반환하는 방식이 가장 작은 후보다. 저장 실패 뒤 재시도와 탭 전환 직전 checkpoint는 유지해야 한다. [workspace-chrome.ts](../lib/workspace-chrome.ts), [workspaces.ts](../lib/workspaces.ts)

**SDK 이벤트 보조:** `useSidebarSplitLayout()`은 전체 목록을 하나의 subscription으로 읽지만, 제공하는 것은 pane rect·threadId·focus이며 단일 pane에서는 `null`이다. plugin route·전체 split tree·maximize 상태까지 주는 복원 API가 아니다. 이 hook을 dirty 신호로 쓰는 실험은 가능하지만, polling을 완전히 없앨 수 있다는 근거는 없다. resize마다 저장을 더 자주 하게 만들지 않도록 합쳐야 한다. 근거: SDK 선언 `:19625`, `:21475`.

**provider 아이콘:** `PaneDragThreadProviders`는 `useComposers()`를 사용한다. 이 hook은 composer 목록 또는 포함된 draft가 바뀔 때 호출 component를 다시 렌더한다고 명시한다. 표시에는 thread/provider 식별자만 필요하므로 stable props를 받는 자식과 아이콘 재사용을 먼저 검토할 수 있다. 실제 ProviderIcon subtree의 commit 횟수는 아직 측정하지 않았다. 원래 hook의 알림 자체를 줄이려면 좁은 metadata subscription이 필요하다. `experimental_useSidebarThreads`는 cache 공유 장점이 있지만 scope·archive 로딩에 따라 모든 열린 pane을 포함한다고 보장할 수 없어 무조건 대체하지 않는다. 근거: [app.tsx](../app.tsx), SDK 선언 `:21351–21379`.

**drag placeholder:** 현재 `visibility: hidden`을 내용과 하위 element에 적용하고 아이콘·제목만 덧붙인다. 본문 DOM은 유지하지만 React·timer·subscription은 그대로다. observer는 실제 pane drag가 시작될 때 body의 직접 자식만 관찰하므로, streaming 전체 subtree observer가 현재 비용 원인은 아니다. 더 강한 render 생략을 실험한다면 pane 전체가 아니라 내용 wrapper에 한정하고 native ghost·drop target·placeholder는 남겨야 한다. [pane-drag.ts](../lib/pane-drag.ts)

**사이드바 전환에 적용한 개선:** 좌우 사이드바가 열리고 닫힐 때 같은 플레이스홀더를 표시하고, 내용 wrapper에 `content-visibility:hidden`을 적용한다. 시작 시 한 번 읽은 크기를 `contain-intrinsic-size`로 유지하며 매 프레임 본문을 읽지 않는다. width/flex transition 종료·취소, blur, dispose, 1초 안전 타이머로 해제하고, 동작 줄이기 설정에서는 생략한다. 이 속성은 내부 layout·paint를 건너뛰지만 React·timer·서버 실행은 계속된다. 실제 앱의 FPS 개선 폭과 Browser·Terminal 네이티브 표면은 별도 검증이 필요하다. [pane-drag.ts](../lib/pane-drag.ts), [Chrome의 content-visibility 설명](https://web.dev/articles/content-visibility)

**이미 제거한 작업:** desktop에서 phone용 720ms geometry 추적을 돌리지 않는다. 후속 사용자 요청으로 사이드바의 네이티브 width/flex transition은 복원했으므로, 이 비용은 실제 화면에서 다시 측정해야 한다. 개별 페인의 확장은 즉시 반영한다. active ring의 220ms opacity 변화는 다른 종류이며, 현재 병목 근거 없이 제거할 이유가 없다. [sidebar-depth.ts](../lib/sidebar-depth.ts), [workspace-chrome.ts](../lib/workspace-chrome.ts)

### 직렬화만 분리한 작은 실험

2026-10-14 Mini, Node `v26.9.0`, Darwin arm64에서 현재 `readNativeLayout → saveWorkspace → JSON.stringify → 직전 문자열 비교`를 그대로 호출했다. pane는 합성 thread ID만 가진 snapshot이며 탭마다 같은 수의 pane를 넣었다. 조건당 1,000회 warmup 후 500회씩 30 batch를 실행했다. 아래 값은 **batch별 회당 평균 30개의 median**이다. 실제 앱 task의 p95나 실제 사용자 latency가 아니다.

| 저장된 탭 × 탭별 pane | 전체 snapshot JSON | 회당 CPU 시간 |
|---|---:|---:|
| 1 × 1 | 323 bytes | 0.0022ms |
| 5 × 4 | 3,447 bytes | 0.0079ms |
| 20 × 8 | 23,353 bytes | 0.0261ms |
| 128 × 8 | 150,814 bytes | 0.1174ms |

**해석:** 탭 수에 따라 비용은 늘지만 이 합성 조건에서는 작다. browser Storage 접근, `ensureBar` DOM 검색, React, style/layout/paint, 다른 thread의 CPU 경합은 측정에서 빠져 있다. 따라서 idle 최적화는 타당하지만, 이것을 큰 frame 저하의 주원인이나 개선율로 제시하지 않는다. 128개는 저장값 검증 경계의 stress 조건이지 권장 사용량이 아니다.

### BB에 필요한 최소 계약

현재 `splitLayoutAtom`은 `createTabScopedStorage`를 사용하고 이 storage 구현은 `subscribe`를 제공하지 않는다. 저장값만 쓰거나 storage event를 보낸다고 살아 있는 React layout이 바뀌는 구조가 아니다. 공개 SDK에는 읽기·개별 열기 수단은 있지만 전체 layout의 atomic restore는 없다. 근거: `lib/split-layout/atoms.ts:18–30`, `lib/browser-storage.ts:153–183`, SDK `useSidebarSplitLayout` 및 thread open 선언.

다음은 **존재하는 API 이름이 아니라 요구 계약**이다.

1. version이 있는 전체 workspace snapshot의 읽기·변경 알림·한 번에 교체. route, pane content, split 크기, focus, maximize를 일관되게 적용한다.
2. pane의 stable identity와 session state 보존. 단일·다중 pane에서 같은 content를 불필요하게 remount하지 않는다.
3. pane/workspace가 표시 중인지 host가 알려 주는 lifecycle. 표시용 구독·timer·native surface를 숨김/복귀에 맞춰 관리한다.
4. Browser·Terminal의 UI view 숨김과 실제 browser session/terminal process의 종료를 구분한다. cache 퇴출이 작업 종료가 되지 않게 한다.

현재 SDK 경계에서는 플러그인이 React fiber·private atom·Storage prototype을 가로채거나 workspace별 iframe에 BB 전체를 중복 부팅하는 방법을 채택하지 않는다. 특히 iframe 방식은 shell·query client·socket까지 늘어나는 별도 아키텍처로서, 현재 문제를 간단히 해결하는 수단이 아니다.

## 판단 원칙

**화면을 숨기는 일, 브라우저 렌더를 건너뛰는 일, React 업데이트·구독을 줄이는 일, 메모리를 반환하는 일은 서로 다르다.** 다중 pane의 비용을 줄이려면 어느 단계가 병목인지 먼저 나눠 측정해야 한다. 브라우저의 JavaScript → Style → Layout → Paint → Composite 단계도 비용과 원인이 다르다. [web.dev Rendering performance](https://web.dev/articles/rendering-performance)

이 문서에서 **확인**은 로컬 코드 또는 공식 문서로 확인한 사실, **제안**은 이 플러그인에 적용할 수 있는 설계 판단, **검증 필요**는 실제 앱에서 아직 입증하지 못한 내용을 뜻한다. BB가 Electron으로 동작한다고 가정하지 않는다.

## 후속 제안: workspace 배치를 플레이스홀더로 전환

사용자 제안은 현재 페인을 단순한 플레이스홀더로 바꾼 뒤 다음 workspace의 배치로 움직여, 화면 준비 중의 빈 화면·깜박임을 줄이는 것이다. **체감 대기 개선 후보로 타당하다. 효과가 진행되는 동안 다음 화면 준비가 겹쳐야 시간을 활용할 수 있다.** 애니메이션을 끝까지 기다린 뒤 navigation을 시작하면 그만큼 지연을 추가한다.

제안하는 흐름:

1. 탭 선택 즉시 현재 pane 위치에 배경·provider 아이콘·제목만 있는 별도 overlay를 표시한다.
2. 저장해 둔 다음 workspace 배치로 overlay 카드만 `transform`·`opacity`로 이동시킨다. 실제 채팅·editor의 폭을 매 frame 바꾸지 않는다. 없어지는 카드와 새 카드는 fade로 처리한다.
3. 다음 내용을 함께 준비하고, 준비된 pane부터 placeholder를 걷어 낸다. 빠르게 준비되면 효과를 단축하고, 늦으면 placeholder를 유지한다. 고정 sleep으로 준비 완료를 가정하지 않는다.

**현재 코드의 제약:** 같은 URL로 복원할 때 `location.reload()`를 호출한다. 이때 이전 document의 overlay와 JS도 함께 종료된다. 세션에 다음 배치와 전환 시작 상태를 남겨 새 document에서 placeholder를 복원할 수는 있지만, 플러그인 mount 전 첫 paint까지 덮는다는 공개 계약은 확인하지 못했다. 따라서 현재 플러그인만으로 끊김 없는 전환이나 로딩 시간의 완전한 은폐를 약속하지 않는다. [workspace-chrome.ts](../lib/workspace-chrome.ts)

**공식 API 검토:** same-document `startViewTransition()`은 같은 document의 DOM 변경용이다. cross-document 전환은 양쪽 문서가 같은 origin이며 CSS로 참여해야 하고, `navigation: auto`에는 사용자·스크립트의 reload가 제외된다. 현재 코드에 이 CSS만 추가해 모든 workspace 전환이 이어진다고 볼 수 없다. [MDN View Transition 사용법](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using), [Chrome cross-document 참여 조건](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document#cross-document_view_transitions_are_opt-in)

**실험 범위:** 재로드 직전·직후 placeholder 복원으로 시각적 단절이 줄어드는지를 실제 desktop에서 먼저 비교한다. 같은 URL의 다른 배치, 다른 URL, 1→4→2 pane, 빠른 연속 탭 선택, 느린 로딩·실패, Browser·Terminal 혼합을 포함한다. 일회성 전환 정보는 짧은 유효기간과 정리 경로를 두어 오래된 overlay가 화면을 가리지 않게 한다. `prefers-reduced-motion`에서는 이동 효과를 생략하며 phone에는 적용하지 않는다.

**채택 조건:** 클릭→사용 가능 시간에 인위적 대기가 추가되지 않고, 빈 frame과 프레임 지연이 줄며, 입력·scroll·native view 복원이 유지될 것. 단절을 줄이지 못하면 실제 적용하지 않는다. 완전한 병행 전환은 재로드 없는 host layout 교체 또는 document 바깥에서 유지되는 host 전환 표면이 필요하다. 이번 후속 조사는 설계 기록만 추가했으며 실행 코드는 변경하지 않았다.

## 공식 자료로 확인한 숨김 방식의 차이

| 방식 | 보존·절감하는 것 | 남는 비용 또는 제한 | 적합한 후보 |
|---|---|---|---|
| `visibility: hidden` | DOM을 유지하면서 화면에서 감춘다 | 정상적으로 layout에 참여한다. CSS 변경만으로 React lifecycle을 변경하지 않는다 | 짧은 drag placeholder의 시각적 단순화 |
| `content-visibility: hidden` | 하위 content의 layout·paint를 생략하고 rendering state를 보존한다 | DOM을 메모리에서 제거하지 않는다. JS 실행·구독 정리는 별도다 | 완전히 가려진 pane, 상태를 보존할 비활성 view |
| `content-visibility: auto` | 화면 밖 등 사용자에게 관련 없는 content의 렌더를 브라우저가 생략한다 | 검색·접근성·focus 대상으로 남는다. 화면에 보이는 다중 pane을 자동 휴면시키는 기능이 아니다 | 긴 문서의 화면 밖 구간 |
| React `<Activity mode="hidden">` | DOM·React state를 보존하고 Effects를 정리한다 | 새 props에 따른 낮은 우선순위 렌더는 계속 가능하며 메모리도 유지한다 | React host가 관리하는 비활성 workspace |
| React unmount | subtree와 내부 state를 버린다 | 다시 열 때 필요한 state를 별도로 복원해야 한다 | 오래 열지 않은 workspace의 cache 퇴출 |

CSS 행의 근거: [MDN visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/visibility), [MDN content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility), [web.dev content-visibility](https://web.dev/articles/content-visibility). React 행의 근거: [React Activity](https://react.dev/reference/react/Activity).

**확인:** `content-visibility` 적용 구간에서 geometry를 요구하는 DOM API를 호출하면 생략하려던 렌더 작업이 발생할 수 있다. 따라서 selector에 속성을 하나 추가하는 것만으로 성능 개선을 보장할 수 없다. [web.dev content-visibility](https://web.dev/articles/content-visibility)

**제안:** drag 중 `visibility`를 더 강한 containment로 바꾸는 실험은 content wrapper의 원래 크기를 보존하는 작은 범위부터 진행한다. `contain-intrinsic-size`는 크기 보존을 돕지만, 채팅 scroll 위치·selection·editor 측정·native view 복귀를 별도로 확인해야 한다. MDN도 hidden 예제에서 크기 대체값으로 layout 변화를 줄인다. [MDN content-visibility 예제](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility#using_hidden_to_manage_visibility)

**확인:** `contentvisibilityautostatechange`는 `auto`의 생략 상태가 변할 때 앱이 canvas 등의 작업을 직접 멈추고 재개할 수 있게 한다. 이는 CSS가 그 작업을 자동 중단한다는 뜻이 아니다. 접근성에 필요한 의미 있는 DOM 업데이트까지 멈추면 안 된다. [MDN contentvisibilityautostatechange](https://developer.mozilla.org/en-US/docs/Web/API/Element/contentvisibilityautostatechange_event)

## React Activity와 bounded keepalive

**확인:** Activity는 React 19.2에서 정식 기능으로 추가되었다. hidden 상태는 Effects를 정리하고, visible 복귀 시 이를 다시 실행한다. 숨겨진 subtree가 새 props로 다시 렌더될 수 있으므로 완전 정지는 아니다. DOM이 남아 있으므로 `<video>`, `<audio>`, `<iframe>`처럼 DOM 자체에 부작용이 있는 요소는 별도 cleanup이 필요할 수 있다. [React 19.2 발표](https://react.dev/blog/2025/10/01/react-19-2), [React Activity lifecycle](https://react.dev/reference/react/Activity#my-hidden-components-have-unwanted-side-effects)

**제안:** BB host에 workspace lifecycle 기능이 생긴다면, 모든 탭의 화면을 무제한 보존하기보다 다음 세 단계로 나눈다.

1. **현재 workspace:** 보이는 pane은 계속 최신 상태를 표시한다. focus를 잃었다는 이유만으로 업데이트를 중단하지 않는다.
2. **최근 workspace:** 우선 직전 1개를 DOM·state와 함께 보존하고, 표시용 구독·timer를 중단한다. 1개는 첫 실험값이지 검증된 최적값이 아니다.
3. **오래된 workspace:** 화면 instance는 unmount하고 layout·draft·scroll 등 복원 가능한 session state를 남긴다. 다시 열 때 재구성한다.

**추론:** 위 정책은 빠른 재방문과 메모리 상한 사이의 절충이다. 사용하지 않는 DOM도 참조가 남아 있으면 GC 대상이 되지 않으므로 DOM 보존 수를 늘리는 일에는 비용이 있다. 안전한 고정 MB 기준은 기기마다 다르다. [Chrome 메모리 진단](https://developer.chrome.com/docs/devtools/memory-problems)

**검증 필요:** BB의 실제 React 버전, 해당 native subtree를 Activity로 감쌀 권한, Effect cleanup의 안전성, pane별 draft/selection/scroll 복원 계약. 플러그인이 native DOM을 감추는 것만으로 host의 React lifecycle을 바꿀 수 있다고 가정하면 안 된다. 이 저장소에서 BB 앱을 수정하지 않는다.

## 좁은 구독과 불필요한 업데이트 감소

**확인:** `useSyncExternalStore`는 `getSnapshot` 결과를 `Object.is`로 비교한다. 변하지 않은 데이터는 같은 snapshot을 반환해야 하며, `subscribe` 함수 참조가 바뀌면 다시 구독한다. 외부 store 변경을 `startTransition`으로 감싼다고 항상 비차단 업데이트가 되는 것도 아니다. [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)

**제안:** 제목·provider icon만 필요한 표시에는 전체 draft나 전체 message collection 대신 `threadId`, `title`, `providerId` 등 필요한 값만 구독하는 SDK 계약이 적합하다. 현재 SDK가 넓은 hook만 제공한다면, 플러그인 내부에서 안정된 값으로 자식 렌더를 줄일 수는 있어도 원래 hook의 알림 비용까지 없앤다고 주장하지 않는다.

**확인:** `memo`는 동일한 props에서 렌더를 건너뛰는 최적화이며 자체 state나 사용한 context 변경은 계속 렌더를 일으킨다. React Compiler가 적용된 구간에서는 수동 memo와 역할이 겹칠 수 있다. [React memo](https://react.dev/reference/react/memo)

**제안:** 일괄 memo 추가보다 입력 한 글자·stream chunk 하나가 어떤 subtree까지 갱신하는지 먼저 확인한다. 공개 SDK가 selector나 변화 알림을 제공하지 않는다면 private store나 React 내부를 가로채지 말고 SDK 개선 항목으로 남긴다.

## pane visibility와 document visibility 구분

**확인:** Page Visibility API는 document의 표시 상태를 다룬다. CSS로 iframe을 숨겨도 그 안 document의 visibility event가 발생하지 않는다. 같은 document 안 workspace/pane의 활성 여부는 별도 앱 상태가 필요하다. `window.blur`도 화면 전체가 안 보인다는 신호로 사용하면 부정확하다. [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

**제안:** 저장·진단 같은 반복 작업은 document가 숨겨졌을 때 일시 중단하는 후보로 삼되, 숨김 직전 checkpoint와 복귀 시 즉시 동기화가 함께 있어야 한다. pane별 휴면에는 `visible`, `covered`, `workspace-inactive`처럼 host가 보장하는 상태를 사용한다.

**추론:** 화면 cache가 늘었다고 서버가 곧바로 다운된다고 결론낼 수 없다. 먼저 늘어나는 것은 보존한 화면의 client 메모리다. 추가 화면이 새 polling, subscription, query를 만들면 서버 비용도 달라지므로 두 비용을 따로 측정해야 한다. UI 휴면이 실행 중인 agent 작업 취소로 연결되지 않도록 역할을 분리하는 것이 설계 조건이다.

## 실제 앱에서 실행할 측정 계획

다음은 **제안하는 실험 계획**이며 아직 측정 결과가 아니다. 단일 종합 점수보다 사용자가 체감한 동작을 반복한다.

| 축 | 비교할 조건 | 확인할 변화 |
|---|---|---|
| pane 수 | 1 / 2 / 4 / 8 | 입력·scroll·stream 중 CPU, React commit, layout·paint |
| workspace 수 | 1 / 5 / 10 | idle 반복 작업과 직렬화 시간, switch 시간, 메모리 |
| 내용 | 짧은 채팅 / 긴 채팅 / stream / Codes·Browser·Terminal 혼합 | 특정 content 유형의 비용과 복귀 결함 |
| 동작 | pane 추가 / drag / resize / maximize / 좌우 sidebar / workspace 왕복 | 첫 화면까지 시간, 긴 task, dropped frame |
| 반복 | 같은 왕복·추가·닫기를 20회 | 닫은 화면 DOM·listener·메모리가 계속 누적되는지 |

**측정 절차 제안:** 동일 기기·동일 창 크기·동일 내용에서 기준 trace와 후보 trace를 각각 5회 이상 수집한다. 각 trace 안에서 같은 동작을 반복하고 cold load와 이미 열었던 화면 복귀를 분리한다. 먼저 median을 비교하고, p95는 충분한 반복 표본을 모은 뒤 표본 수와 함께 보고한다. frame 시간과 동작 완료 시간은 별도 지표다.

**확인:** Chrome Performance trace는 main thread, layout/paint, 50ms 초과 task, frame 지연, network를 함께 보여준다. Performance monitor는 CPU, JS heap, DOM node, listener, layout·style recalculation 빈도를 관찰한다. Chromium이 아닌 실제 host에서는 해당 엔진의 도구를 사용하고 Chrome 재현 결과를 실제 desktop 측정으로 부르지 않는다. [Chrome Performance reference](https://developer.chrome.com/docs/devtools/performance/reference), [Chrome Performance monitor](https://developer.chrome.com/docs/devtools/performance-monitor)

**확인:** React Profiler의 `actualDuration`은 해당 subtree 렌더 시간이다. 이를 브라우저의 전체 layout·paint나 서버 시간으로 해석하면 안 된다. React Performance tracks는 development/profiling build에서 제공되며 계측 자체에도 비용이 있다. 기존 production 번들에서 이 정보가 없다고 plugin 임의로 host React build를 교체하지 않는다. [React Profiler](https://react.dev/reference/react/Profiler), [React Performance tracks](https://react.dev/reference/dev-tools/react-performance-tracks)

**측정 목표 제안:** 연속 drag·resize에서는 실제 refresh rate에 맞는 frame 예산을 사용한다. 60Hz의 frame 간격은 약 16.7ms, 120Hz는 약 8.3ms이며 이 전부가 앱 JavaScript 예산은 아니다. 단발 workspace 전환은 별도로 클릭→사용 가능한 화면 시간을 기록한다. [web.dev Rendering performance](https://web.dev/articles/rendering-performance)

**메모리 확인 제안:** 화면을 반복 열고 닫은 뒤 동일한 GC 조건에서 heap snapshot을 비교한다. node가 남는 것은 cache일 수도 있으므로 유지 이유와 상한을 함께 본다. heap 외 DOM/native view/GPU 관련 메모리는 별도로 확인하고, JS heap 하나로 전체 앱 메모리를 추정하지 않는다. [Chrome 메모리 진단](https://developer.chrome.com/docs/devtools/memory-problems)

## 적용 전 남은 확인

- 현재 플러그인의 반복 작업이 실제 비용의 몇 퍼센트인지.
- workspace 재로드를 없앨 수 있는 공개 SDK 계약과 native state 소유권.
- 조사한 native hidden-pane 처리·timeline 가상화·resize 최적화가 실제 desktop 번들에서도 켜져 있는지.
- 실제 BB desktop에서의 FPS, memory, stream 처리량. 이 문서에는 이를 측정한 수치가 없다.
- phone UI와 native Browser·Terminal의 상태 보존. desktop용 후보를 phone으로 확장하지 않는다.
