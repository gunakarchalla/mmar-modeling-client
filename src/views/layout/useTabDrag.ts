import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { tabsClasses } from "@mui/material";

// Drag-to-reorder for the tab bar, browser style: the grabbed tab follows the pointer,
// the tabs it passes slide aside, and releasing drops it into the slot it is over.
//
// Every tab has the same width, so the slots form a regular grid and the drop slot is
// plain arithmetic on the drag offset; nothing has to be measured per tab.
//
// The hook only moves pixels. What a drop MEANS (reordering the store, activating the
// tab) belongs to the caller's `onDrop`.
//
// The metamodeling client's tab strip has the same file
// (src/views/object-tabs/useTabDrag.ts): the two apps share no UI package, so keep
// them in step.

/** Pointer travel (px) before a press becomes a drag; below it a press is a click. */
const DRAG_THRESHOLD = 5;
/** Distance (px) from the strip's edge at which a drag starts scrolling the strip. */
const AUTO_SCROLL_EDGE = 32;
/** Auto-scroll speed in px per animation frame. */
const AUTO_SCROLL_STEP = 8;

/** A drag in progress, as the tab bar needs it to render. */
export interface TabDrag {
  /** Uuid of the tab being dragged. */
  uuid: string;
  /** Tab-bar slot the tab was picked up from. */
  from: number;
  /** Slot it would drop into right now. */
  to: number;
  /** How far (px) the dragged tab is drawn from its own slot. */
  offset: number;
  /** Width (px) of one slot. */
  pitch: number;
}

/** Keep the dragged tab inside the strip: no further left than slot 0 or right than the last. */
export function clampDragOffset(from: number, offset: number, pitch: number, count: number): number {
  return Math.max(-from * pitch, Math.min(offset, (count - 1 - from) * pitch));
}

/** The slot a tab dragged `offset` px from slot `from` drops into: the one it covers most of. */
export function dropSlot(from: number, offset: number, pitch: number, count: number): number {
  if (pitch <= 0 || count <= 0) return from;
  return Math.max(0, Math.min(count - 1, from + Math.round(offset / pitch)));
}

/**
 * How far (px) the NON-dragged tab in `slot` slides while a tab dragged from `from`
 * hovers over `to`: the tabs in between each move one slot toward the gap it left.
 */
export function slideOffset(slot: number, from: number, to: number, pitch: number): number {
  if (from < to && slot > from && slot <= to) return -pitch;
  if (to < from && slot >= to && slot < from) return pitch;
  return 0;
}

/**
 * @param count     number of tabs on the bar
 * @param fallbackPitch slot width to use when layout cannot be measured (jsdom)
 * @param onDrop    called once when a drag is released, with the dragged tab and its
 *                  drop slot (which may equal its starting slot)
 */
export function useTabDrag(
  count: number,
  fallbackPitch: number,
  onDrop: (uuid: string, slot: number) => void,
) {
  const [drag, setDrag] = useState<TabDrag | null>(null);
  // Tears down whatever drag (or pending press) is in flight. Held in a ref so the
  // unmount cleanup and `cancel` can reach the listeners a press installed.
  const teardownRef = useRef<(() => void) | null>(null);
  // `onDrop` is a fresh closure every render; the listeners read the current one.
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  const cancel = useCallback(() => {
    teardownRef.current?.();
  }, []);

  // Never leave window listeners or an auto-scroll loop behind an unmounted tab bar.
  useEffect(() => cancel, [cancel]);

  // The tab count is fixed for the life of a drag: the slot math assumes it. If a tab
  // opens or closes mid-drag (a revoked shared scene, say), drop the drag rather than
  // land the tab in a slot computed for a different bar.
  const countRef = useRef(count);
  useEffect(() => {
    if (countRef.current !== count) cancel();
    countRef.current = count;
  }, [count, cancel]);

  /** Attach to each tab's `onPointerDown`. `slot` is the tab's position on the bar. */
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, uuid: string, slot: number) => {
      if (event.button !== 0 || !event.isPrimary) return;
      // The close button is a click target of its own, never a drag handle.
      if ((event.target as Element).closest("[data-tab-close]")) return;

      teardownRef.current?.();

      const tabEl = event.currentTarget;
      const scroller = tabEl.closest<HTMLElement>(`.${tabsClasses.scroller}`);
      const pitch = tabEl.offsetWidth || fallbackPitch;
      const total = count;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startScroll = scroller?.scrollLeft ?? 0;
      let lastX = startX;
      let active = false;
      let scrollSpeed = 0;
      let frame = 0;

      // The offset follows the pointer AND any scrolling of the strip, so the tab stays
      // under the pointer while the strip scrolls beneath it.
      const render = () => {
        const raw = lastX - startX + ((scroller?.scrollLeft ?? 0) - startScroll);
        const offset = clampDragOffset(slot, raw, pitch, total);
        setDrag({ uuid, from: slot, to: dropSlot(slot, offset, pitch, total), offset, pitch });
      };

      const autoScroll = () => {
        frame = 0;
        if (!scroller || scrollSpeed === 0) return;
        scroller.scrollLeft += scrollSpeed;
        frame = requestAnimationFrame(autoScroll);
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        lastX = e.clientX;
        if (!active) {
          if (Math.abs(lastX - startX) < DRAG_THRESHOLD) return;
          active = true;
        }
        render();
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          scrollSpeed =
            lastX < rect.left + AUTO_SCROLL_EDGE ? -AUTO_SCROLL_STEP
            : lastX > rect.right - AUTO_SCROLL_EDGE ? AUTO_SCROLL_STEP
            : 0;
          if (scrollSpeed !== 0 && frame === 0) frame = requestAnimationFrame(autoScroll);
        }
      };

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        const wasActive = active;
        const raw = lastX - startX + ((scroller?.scrollLeft ?? 0) - startScroll);
        teardown();
        if (!wasActive) return; // a plain press: let the click select the tab as usual
        // The release would also click whatever tab is under the pointer; the drop
        // already decides what happens, so swallow that one click.
        const swallow = (c: MouseEvent) => {
          c.stopPropagation();
          c.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
        onDropRef.current(uuid, dropSlot(slot, clampDragOffset(slot, raw, pitch, total), pitch, total));
      };

      const onCancel = (e: PointerEvent) => {
        if (e.pointerId === pointerId) teardown();
      };

      // Escape puts the tab back where it was, as browsers do.
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && active) {
          e.preventDefault();
          e.stopPropagation();
          teardown();
        }
      };

      const onScroll = () => {
        if (active) render();
      };

      function teardown() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        scroller?.removeEventListener("scroll", onScroll);
        if (frame !== 0) cancelAnimationFrame(frame);
        frame = 0;
        scrollSpeed = 0;
        if (teardownRef.current === teardown) teardownRef.current = null;
        setDrag(null);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
      scroller?.addEventListener("scroll", onScroll, { passive: true });
      teardownRef.current = teardown;
    },
    [count, fallbackPitch],
  );

  return { drag, onPointerDown, cancel };
}
