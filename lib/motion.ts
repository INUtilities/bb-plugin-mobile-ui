// BB 플러그인 공용 모션. 값은 2026-10-11 사용자가 데모에서 고른 것이다.
// 이 파일을 플러그인으로 복사해 쓰고, 복사본은 고치지 않는다.
// 모든 함수는 transform·opacity·height만 움직인다. 옆 요소의 자리를 밀지 않는다.
// 동작 줄이기(prefers-reduced-motion)가 켜져 있으면 애니메이션 없이 상태만 반영한다.

export const EASE = {
  /** 감속 등장: 빠르게 나와 부드럽게 멈춤 */
  out: "cubic-bezier(.22,1,.36,1)",
  /** 물방울: 늦게 출발해 탄성 있게 */
  droplet: "cubic-bezier(.36,0,.18,1)",
  /** 오버슈트: 살짝 넘쳤다 돌아옴 */
  overshoot: "cubic-bezier(.2,.9,.22,1.25)",
  /** 표준 퇴장: 조용히 사라짐 */
  exit: "cubic-bezier(.4,0,.2,1)",
  /** 숫자 룰렛 전용 */
  roll: "cubic-bezier(.2,.8,.2,1)",
} as const;

export function prefersReducedMotion(): boolean {
  const media = (globalThis as { matchMedia?: (query: string) => { matches: boolean } }).matchMedia;
  return media?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** CSS keyframes처럼 구간마다 같은 easing을 건다. */
function perSegment(frames: Keyframe[], easing: string): Keyframe[] {
  return frames.map((frame, index) => (index < frames.length - 1 ? { ...frame, easing } : frame));
}

function play(el: Element, frames: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (prefersReducedMotion()) return null;
  return el.animate?.(frames, options) ?? null;
}

const DROPLET_FRAMES: Keyframe[] = [
  { transform: "translateY(8px) scale(.82,.72)", offset: 0 },
  { transform: "translateY(-4px) scale(.94,1.16)", offset: 0.35 },
  { transform: "translateY(0) scale(1.1,.94)", offset: 0.65 },
  { transform: "translateY(-1px) scale(.985,1.015)", offset: 0.82 },
  { transform: "none", offset: 1 },
];

/** 물방울 등장 · 460ms. 처음 나타날 때 눌렸다 늘었다 자리 잡는다. */
export function dropletIn(el: Element, { delay = 0 } = {}): Animation | null {
  return play(el, perSegment(DROPLET_FRAMES, EASE.droplet), { duration: 460, delay, fill: "backwards" });
}

/** 순차 등장 · 항목마다 물방울 등장, 45ms 간격. */
export function staggerIn(els: Iterable<Element>, step = 45): Array<Animation | null> {
  return [...els].map((el, index) => dropletIn(el, { delay: index * step }));
}

/**
 * 왼쪽 축소 퇴장 · 200ms. 복제본이 폭 0, scale .88로 줄며 자리도 함께 닫힌다.
 * 원본은 바로 숨기고, 복제본이 끝나면 지운다. `gap`은 이웃과의 간격(px)이다.
 */
export function exitLeft(el: HTMLElement, { gap = 8 } = {}): Promise<void> {
  if (prefersReducedMotion() || !el.isConnected) {
    el.hidden = true;
    return Promise.resolve();
  }
  const style = getComputedStyle(el);
  const width = `${el.offsetWidth}px`;
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    width, minWidth: "0", boxSizing: "border-box", overflow: "hidden",
    pointerEvents: "none", transformOrigin: "left center",
  });
  el.before(ghost);
  el.hidden = true;
  const animation = ghost.animate(
    [
      { width, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, marginRight: "0px", opacity: 1, transform: "none" },
      { width: "0px", paddingLeft: "0px", paddingRight: "0px", marginRight: `-${gap}px`, opacity: 0, transform: "scale(.88)" },
    ],
    { duration: 200, easing: EASE.exit, fill: "forwards" },
  );
  return new Promise((resolve) => {
    const done = () => { ghost.remove(); resolve(); };
    animation.onfinish = done;
    animation.oncancel = done;
  });
}

/**
 * 숫자 룰렛 · 180ms. `box`는 overflow:hidden인 칸이고, 안의 `.bbk-roll-n`이 숫자다.
 * 옛 숫자는 위로 빠지고 새 숫자가 아래에서 올라온다.
 */
export function rollNumber(box: HTMLElement, text: string): void {
  const old = box.querySelector<HTMLElement>(".bbk-roll-n");
  if (old?.textContent === text) return;
  const next = box.ownerDocument.createElement("span");
  next.className = "bbk-roll-n";
  next.textContent = text;
  box.append(next);
  if (prefersReducedMotion()) {
    old?.remove();
    return;
  }
  if (old) {
    const out = old.animate(
      [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-100%)", opacity: 0 }],
      { duration: 180, easing: EASE.roll, fill: "forwards" },
    );
    out.onfinish = () => old.remove();
  }
  next.animate(
    [{ transform: "translateY(100%)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }],
    { duration: 180, easing: EASE.roll },
  );
}

/** 팝오버 올라오기 · 260ms. 8px 아래에서 살짝 커지며 나타난다. */
export function popoverRise(el: Element): Animation | null {
  return play(
    el,
    [{ opacity: 0, transform: "translateY(8px) scale(.98)" }, { opacity: 1, transform: "none" }],
    { duration: 260, easing: EASE.out },
  );
}

/** 높이 전환 · 320ms. 접힘·펼침에 쓴다. 끝난 뒤 최종 높이는 호출한 쪽이 정한다. */
export function heightTo(el: Element, from: number, to: number): Animation | null {
  return play(el, [{ height: `${from}px` }, { height: `${to}px` }], { duration: 320, easing: EASE.out });
}

/**
 * 꾹 눌렸다 팝 · 사용자가 누를 때.
 * 누르는 동안 scale .9(120ms), 떼면 1.1 → .97 → 1(380ms, 물방울 easing).
 */
export function pressPop(el: Element): { down(): void; up(): void } {
  let held: Animation | null = null;
  return {
    down() {
      held?.cancel();
      held = play(el, [{ transform: "scale(1)" }, { transform: "scale(.9)" }], { duration: 120, easing: "ease-out", fill: "forwards" });
    },
    up() {
      held?.cancel();
      held = null;
      play(
        el,
        perSegment(
          [
            { transform: "scale(.9)", offset: 0 },
            { transform: "scale(1.1)", offset: 0.42 },
            { transform: "scale(.97)", offset: 0.72 },
            { transform: "scale(1)", offset: 1 },
          ],
          EASE.droplet,
        ),
        { duration: 380 },
      );
    },
  };
}

/**
 * 통통 착지 · 출처 없이 pill이나 접힌 원 버튼 아이콘이 바뀔 때.
 * 7px 뛰어올라 늘어남 → 착지하며 눌림 → 작은 반동. 420ms.
 */
export function eventHop(el: Element): Animation | null {
  return play(
    el,
    perSegment(
      [
        { transform: "translateY(0) scale(1,1)", offset: 0 },
        { transform: "translateY(-7px) scale(.95,1.06)", offset: 0.34 },
        { transform: "translateY(0) scale(1.08,.9)", offset: 0.6 },
        { transform: "translateY(-2px) scale(.98,1.02)", offset: 0.8 },
        { transform: "translateY(0) scale(1,1)", offset: 1 },
      ],
      EASE.out,
    ),
    { duration: 420 },
  );
}

/**
 * 끈적 분리 · 보이는 출처에서 무엇이 날아와 대상에 들어갈 때.
 * 출발 요소가 찌그러지며 방울을 떼어 내고(360ms), 방울은 진행 방향으로 늘어난 채
 * 460ms 날아가 대상 가장자리에서 납작해지며 스며든다. 대상은 380ms 출렁인다.
 * `onArrive`는 방울이 닿는 순간 한 번 불린다(예: 숫자 올리기).
 * 방울 모양은 `.bbk-drop` 클래스로 꾸민다(motion.css).
 */
export function stickyDrop(from: Element, to: Element, onArrive: () => void = () => {}): Promise<void> {
  if (prefersReducedMotion()) {
    onArrive();
    return Promise.resolve();
  }
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const x = start.left + start.width / 2;
  const y = start.top + start.height / 2;
  const dx = end.left + end.width / 2 - x;
  const dy = end.top + end.height / 2 - y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const size = 14;

  from.animate?.(
    perSegment(
      [
        { transform: "scale(1)", offset: 0 },
        { transform: "scale(.84,1.14)", offset: 0.3 },
        { transform: "scale(1.07,.94)", offset: 0.65 },
        { transform: "scale(1)", offset: 1 },
      ],
      EASE.droplet,
    ),
    { duration: 360 },
  );

  const drop = document.createElement("span") as HTMLElement;
  drop.setAttribute("aria-hidden", "true");
  drop.className = "bbk-drop";
  Object.assign(drop.style, {
    position: "fixed", left: `${x - size / 2}px`, top: `${y - size / 2}px`,
    width: `${size}px`, height: `${size}px`, pointerEvents: "none",
  });
  document.body.append(drop);

  const flight = drop.animate(
    [
      { transform: `rotate(${angle}deg) scale(1.7,.55)`, opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.3}px,${dy * 0.3 - 18}px) rotate(${angle}deg) scale(1.3,.8)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${dx * 0.85}px,${dy * 0.85 - 6}px) rotate(${angle}deg) scale(1.15,.9)`, opacity: 1, offset: 0.8 },
      { transform: `translate(${dx * 0.97}px,${dy * 0.97}px) rotate(${angle}deg) scale(.6,1.6)`, opacity: 0.9, offset: 0.92 },
      { transform: `translate(${dx}px,${dy}px) scale(.1)`, opacity: 0, offset: 1 },
    ],
    { duration: 460, easing: "cubic-bezier(.3,.6,.2,1)", fill: "both" },
  );

  return new Promise((resolve) => {
    const land = () => {
      drop.remove();
      onArrive();
      to.animate?.(
        perSegment(
          [
            { transform: "scale(1)", offset: 0 },
            { transform: "scale(1.12,.9)", offset: 0.35 },
            { transform: "scale(.96,1.05)", offset: 0.7 },
            { transform: "scale(1)", offset: 1 },
          ],
          EASE.droplet,
        ),
        { duration: 380 },
      );
      resolve();
    };
    flight.onfinish = land;
    flight.oncancel = () => { drop.remove(); resolve(); };
  });
}
