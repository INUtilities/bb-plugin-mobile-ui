# Sidebar

BB의 좌우 사이드바와 메인 영역을 카드 레이아웃으로 표시하는 플러그인이다.

- desktop: 기존 네이티브 분할·리사이즈를 유지하며 카드 사이의 여백과 모서리를 적용한다.
- 왼쪽 본문·푸터는 고정 폭과 위치를 유지하고, 바깥 clip과 메인 화면만 320ms로 움직인다.
- phone: 기존 드로어·shelf 모션과 native bridge 햅틱을 유지한다.
- 저장된 배치 탭·활성 페인 강조·드래그 플레이스홀더는 별도 `multipanes` 플러그인이 담당한다.

## 개발과 적용

```sh
npm install
npm test
npm run typecheck
bb plugin build .
bb plugin reload sidebar
```

설치 소스는 `bb plugin source sidebar --json`으로 확인한다. plugin id는 `sidebar`다.
`openMode`와 `desktopLayout` 설정은 사용하지 않는다. Sidebar는 클릭 내비게이션이나 배치를 저장하지 않는다.

기기 판정·모션 복사본은 kit 원본을 따른다. 최종 화면은 사용자가 판단하며 desktop·phone 캡처와 미확인 범위를 함께 보고한다.
