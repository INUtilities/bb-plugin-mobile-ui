---
name: sidebar
description: BB의 상단 워크스페이스 탭, 페인 열기 방식, 사이드바·페인 간 여백과 모서리 및 기존 phone 드로어 모션을 변경한다.
---

# Sidebar와 워크스페이스

plugin id는 `sidebar`다. 실제 설치 소스는 `bb plugin source sidebar --json`으로 확인한다. 프로토타입 요청과 실제 플러그인 변경 요청을 구분한다.

## 제품 계약

- 상단 탭 하나가 여러 네이티브 BB 페인과 그 배치를 소유한다.
- 기본 탭 하나로 시작하고 마지막 탭은 닫을 수 없다.
- 화면은 기존 왼쪽 리본 메뉴와 스레드 목록에서 연다. 오른쪽에 새 도구 목록을 만들지 않는다.
- `openMode`는 `new-pane`(기본) 또는 `replace`다. 설정 UI에서는 「새 페인에 열기」와 「현재 활성 페인의 화면 교체」로 표시한다.
- `desktopLayout` 설정은 제거했다. 오래된 카드 토글·이벤트·저장값을 다시 읽지 않는다.
- 워크스페이스 제목·페인 개수·좌우/상하 분할 버튼으로 된 별도 툴바는 만들지 않는다.

## 코드 경계

- `lib/workspaces.ts`: 워크스페이스 상태, 저장값 검증, 네이티브 페인 트리의 검증.
- `lib/workspace-chrome.ts`: 상단 탭, 네이티브 세션 저장소 연결, 네이티브 modifier-click 내비게이션과 여백 CSS.
- `lib/pane-drag.ts`: 네이티브 페인 제목 드래그 중 플레이스홀더. 스레드는 프로바이더 아이콘과 최대 두 줄의 제목, 플러그인은 기존 헤더 아이콘을 표시한다. `app.tsx`가 SDK의 `useComposers`와 `experimental_ProviderIcon`으로 미리 렌더한 아이콘을 복사하며 드래그 중 서버 요청은 하지 않는다. 콘텐츠 DOM을 떼지 않고 가리며, 네이티브 ghost의 생성·제거와 드롭·취소를 따라 정리한다. 사이드바 행 드래그와 제목 단순 클릭에는 적용하지 않는다.
- `app.tsx`: 콘텐츠 스크립트와 기기·설정 브리지 등록.
- `server.ts`: `openMode` 설정과 `workspace-preferences` realtime 채널.
- `lib/sidebar-depth.ts`: 기존 phone 드로어·shelf 모션과 패널 탭 햅틱. 데스크톱의 이전 카드 CSS 분기는 런타임에서 끈다.

데스크톱의 사이드바 열기·닫기와 페인 확장·복원은 즉시 전환한다. 네이티브 레이아웃 표면의 `width`·`flex-grow`·`flex-basis` 전환만 끄고 콘텐츠 내부 버튼의 효과는 유지한다. `injectSidebarDepth`의 CSS·위치 추적·입력 이벤트 감시는 phone에서만 실행한다. desktop에서 `pointermove`·`wheel`마다 720ms 동안 모든 페인 크기를 읽는 루프를 다시 켜지 않는다. 드래그 플레이스홀더는 실제 페인 드래그에만 사용한다.

기기 판정은 kit에서 그대로 복사한 `lib/device.ts`, `lib/use-device.ts`만 사용한다. 두 복사본은 고치지 않는다. 데스크톱의 좁은 창을 phone으로 취급하지 않는다. 색은 현재 BB 테마 토큰만 쓴다. 스레드 목록의 행 테마와 다른 플러그인 설정은 건드리지 않는다.

## 네이티브 복원 제약

페인 추가·교체에는 재로드를 쓰지 않는다. 새 페인 모드의 기본 클릭은 BB의 `⌘/Ctrl+클릭` 분할 동작에 전달하고, 교체 모드는 원래 내비게이션을 유지한다. 명시적인 modifier-click은 가로채지 않는다. 페인 추가를 위해 `history`를 감싸거나 `bb.splitLayout`에 쓰지 않는다. 최대 8개에서는 일반 클릭으로 기존 콘텐츠를 교체하지 않고 안내한다.

BB의 첫 1→2 분할은 단일 페인 렌더에서 분할 트리 렌더로 바뀌며 채팅을 다시 마운트한다. 문서 재로드 제거와 네이티브 컴포넌트 마운트 유지를 구분해서 보고한다.

현재 SDK에는 전체 배치 복원 API가 없다. 워크스페이스 탭 추가·전환·활성 탭 닫기에만 재초기화가 남아 있다. `bb.splitLayout` version 1과 `bb.splitLayout.maximizedPaneId`의 네이티브 세션 값을 저장하고 앱 화면 재초기화로 복원한다. 네이티브 저장 형식을 바꿀 때는 현재 BB SDK와 소스를 먼저 읽는다. BB 앱 소스·설치 파일을 직접 고치지 않는다.

탭 목록은 현재 창의 `sessionStorage`에만 둔다. 앱 재로드에서는 유지하고 새 세션에서는 기본 탭부터 시작한다. 플러그인 내부 메모리 상태나 Browser·Terminal 네이티브 뷰의 연속 마운트를 보장한다고 보고하지 않는다.

우측 `aside`에는 `filter`, `transform`, `left`/`right`, `backdrop-filter`를 추가하지 않는다. Browser 네이티브 뷰와 Terminal WebGL을 깨뜨릴 수 있다. 리사이즈 히트 영역은 유지한다. 네이티브 페인 최대 개수는 8이다.

## 확인과 적용

`npm test`, `npm run typecheck`, `bb plugin build .`를 실행한다. 요청이 실제 화면 확인을 포함하면 검증된 변경을 설치 소스에 합치고 `bb plugin reload sidebar`로 적용한다. 설치 경로와 실행 번들 해시를 확인한다.

워크스페이스 전환·복원, 왼쪽 리본 페이지 열기, 스레드 목록 열기, 새 페인/활성 페인 교체, 마지막 탭 보호를 실제 앱에서 확인한다. native title bar와 웹의 content shell 두 위치가 모두 중요하다. phone 캡처가 없으면 없다고 명시한다. 화면 완료는 사용자가 판정한다.
