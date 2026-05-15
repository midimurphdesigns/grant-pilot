/**
 * Cursor — bone rectangle that morphs by hover context. Ported from
 * kevinmurphywebdev.com so this demo shares the same custom-cursor
 * vocabulary as the main portfolio.
 *
 * States (CSS transitions ~180 ms):
 *   default  → 16 × 4 px bone rectangle (playhead tick)
 *   link     → 24 × 24 outline square rotated 45deg, cyan reticle
 *   image    → 56 × 56 outline circle, bone viewfinder
 *   text     → 4 × 22 px vertical bone bar, I-beam
 *   pressed  → scale 0.6 punch on pointerdown
 *
 * mix-blend-mode: difference keeps the mark legible across cyan accents
 * and photographs. Magnetism: 32 px radius, 0.12 pull on a, button,
 * [data-magnetic]. Drops out on touch via (hover: hover) and
 * (pointer: fine), plus a defensive teardown on first touchstart.
 *
 * Mounted from the root layout.tsx. CSS lives in globals.css.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

type CursorState = 'default' | 'link' | 'image' | 'text';

export default function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!isFinePointer) return;

    let teardown: (() => void) | null = null;
    function onFirstTouch() {
      setEnabled(false);
      document.documentElement.classList.remove('cursor-ready');
      teardown?.();
    }
    window.addEventListener('touchstart', onFirstTouch, { once: true, passive: true });

    setEnabled(true);
    document.documentElement.classList.add('cursor-ready');

    let pointerX = -100;
    let pointerY = -100;
    let state: CursorState = 'default';
    let raf = 0;

    function setPressed(pressed: boolean): void {
      if (rootRef.current) rootRef.current.dataset.pressed = pressed ? 'true' : 'false';
    }
    function onPointerDown(): void { setPressed(true); }
    function onPointerUp(): void { setPressed(false); }

    function classify(target: EventTarget | null): CursorState {
      if (!(target instanceof HTMLElement)) return 'default';
      if (target.closest('a, button, [data-magnetic]')) return 'link';
      if (target.closest('img, picture, video')) return 'image';
      if (
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return 'text';
      }
      return 'default';
    }

    function magnetize(target: HTMLElement, x: number, y: number): { x: number; y: number } {
      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = cx - x;
      const dy = cy - y;
      const dist = Math.hypot(dx, dy);
      const radius = 32;
      if (dist > radius) return { x, y };
      const pull = (radius - dist) / radius;
      return { x: x + dx * pull * 0.12, y: y + dy * pull * 0.12 };
    }

    function onPointerMove(e: PointerEvent): void {
      pointerX = e.clientX;
      pointerY = e.clientY;
      const next = classify(e.target);
      if (next !== state) {
        state = next;
        if (rootRef.current) rootRef.current.dataset.state = state;
      }
    }
    function onLeave(): void {
      if (rootRef.current) rootRef.current.dataset.hidden = 'true';
    }
    function onEnter(): void {
      if (rootRef.current) rootRef.current.dataset.hidden = 'false';
    }

    function tick(): void {
      let x = pointerX;
      let y = pointerY;
      if (state === 'link') {
        const target = document.elementFromPoint(x, y);
        const link =
          target instanceof Element
            ? target.closest<HTMLElement>('a, button, [data-magnetic]')
            : null;
        if (link) {
          const m = magnetize(link, x, y);
          x = m.x;
          y = m.y;
        }
      }
      if (rootRef.current) {
        rootRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    raf = requestAnimationFrame(tick);

    teardown = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      document.documentElement.classList.remove('cursor-ready');
    };

    return () => {
      window.removeEventListener('touchstart', onFirstTouch);
      teardown?.();
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      ref={rootRef}
      className="cursor-root"
      data-state="default"
      data-hidden="false"
      data-pressed="false"
      aria-hidden
    >
      <div className="cursor-mark" />
    </div>
  );
}
