---
name: sidebar
description: BB의 좌우 사이드바·메인 영역 카드와 사이드바 모션, 기존 phone 드로어·햅틱을 변경한다.
---

# Sidebar

plugin id는 `sidebar`다. 실제 설치 소스는 `bb plugin source sidebar --json`으로 확인한다.

## 제품 계약과 경계

- `app.tsx`: content script와 기기 브리지를 등록한다.
- `lib/sidebar-cards.ts`: desktop 외곽 카드·좌우 사이드바 표면·메인 페인 여백과 모서리, Multipanes가 없을 때의 활성 페인 강조. 네이티브 분할·리사이즈는 유지한다.
- `lib/sidebar-depth.ts`: 기존 phone 드로어·shelf 모션과 패널 탭 햅틱. 위치 추적·입력 이벤트 감시는 phone에서만 실행한다.
- `lib/sidebar-chrome.ts`: 기기 상태와 phone gate를 전달한다.
- 저장된 배치 탭·드래그 및 사이드바 전환 플레이스홀더는 별도 `multipanes` 플러그인 소유다.
- Sidebar는 페인 내비게이션, 탭 상태, 세션 이전, `openMode` 설정을 소유하지 않는다. 오래된 `openMode`·`desktopLayout` 저장값은 읽지 않는다.

왼쪽은 kit의 `EASE.exit`, 오른쪽은 `EASE.out`으로 320ms 네이티브 width/flex 전환을 쓴다. 왼쪽 본문의 visibility 지연도 320ms다. 본문·푸터는 고정 위치 `left:0; right:auto`와 panel에서 상속한 `--sidebar-slide-width`를 쓴다. 전환 중 `max-width:100%`로 내용 폭을 줄이지 않는다.

왼쪽 목록·푸터는 같은 `--sidebar` 표면으로 맞닿으며 목록 위와 푸터 아래의 바깥 모서리만 18px로 둔다. native DOM·스크롤 컨테이너를 옮기지 않는다. 목록의 아래 margin은 푸터의 위 margin을 상쇄하여 중간 여백을 없앤다. 푸터 행 높이·리본 버튼·메인 간격은 유지한다. Multipanes가 꺼져 offset이 0이 되어도 두 표면은 이어져야 한다.

Multipanes의 탭 높이는 `--bb-multipanes-frame-offset`, `--bb-multipanes-web-offset` CSS 변수로 받는다. 해당 플러그인이 꺼지면 기본값 0으로 돌아간다. Sidebar는 Multipanes DOM·이벤트를 만들거나 제거하지 않는다. 카드의 배경 규칙에서는 Multipanes placeholder와 native focus scrim을 제외한다.

desktop 분할 페인의 강조는 native `data-focused="true"`를 CSS로 읽는다. Sidebar 단독에서는 기존 카드의 `::after` 하나로 표시하며, root의 `data-bb-multipanes`가 있으면 Multipanes의 강조에 맡긴다. 포커스용 DOM·observer·listener를 추가하지 않는다. phone에는 적용하지 않으며 동작 줄이기에서는 opacity 전환을 끈다.

우측 `aside`에는 `filter`, `transform`, `left`/`right`, `backdrop-filter`를 추가하지 않는다. Browser native view와 Terminal WebGL의 제약을 유지한다. `[data-split-pane-id] > div` 전체에 배경을 칠하지 않는다. focus scrim과 내부 카드·입력·선택 색을 유지한다.

기기 판정은 kit에서 그대로 복사한 `lib/device.ts`, `lib/use-device.ts`만 사용한다. 좁은 desktop 창은 phone이 아니다. `lib/motion.ts` 복사본은 수정하지 않는다. 색은 BB 테마 토큰을 쓴다.

## 확인과 적용

`npm test`, `npm run typecheck`, `bb plugin build .`를 실행한다. 실제 적용 요청에서는 `bb plugin reload sidebar` 후 설치 경로·실행 번들 해시를 확인한다.

Sidebar만, Multipanes와 함께, 비활성화·재활성화 상태의 카드·클릭·정리를 확인한다. phone native haptics와 native Browser·Terminal은 별도 검증 대상이다. 검증 커밋, 실행 번들, desktop·phone 캡처, 미확인을 보고하며 화면 완료는 사용자가 판단한다.
