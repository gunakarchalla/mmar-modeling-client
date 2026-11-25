// @vitest-environment jsdom
//
// useKeyboardShortcuts (P5) is mounted by the P6 app shell. This covers the binding the
// shell depends on for the Save dialog (Ctrl+S -> `ctrlPlusSPressed`) and the undo/redo
// chords, which are the metamodeling twin's — Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl/⌘+Y — with
// the one deliberate difference that they stand down inside a text field. The engine
// leaves are mocked (the real ones build a WebGLRenderer); eventBus is real.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  historyService: { undo: vi.fn(async () => undefined), redo: vi.fn(async () => undefined) },
  globalSelectedObject: {
    object: null as { uuid: string } | null,
    getObject: vi.fn(() => ({ uuid: "obj-1", position: { x: 0, y: 0, z: 0 } })),
  },
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: { render: false } }));
vi.mock("@/engine/global-selected-object", () => ({ globalSelectedObject: mocks.globalSelectedObject }));
vi.mock("@/engine/deletion-handler", () => ({ deletionHandler: { onPressDelete: vi.fn() } }));
vi.mock("@/resources/services/math-utility", () => ({ mathUtility: { roundPosOfObject: vi.fn() } }));
vi.mock("@/resources/services/history-service", () => ({ historyService: mocks.historyService }));

import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { eventBus } from "@/resources/services/event-bus";

const realUserAgent = navigator.userAgent;

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
}

/**
 * Dispatch a keydown at the window, or from inside a text input (which bubbles up to
 * the same window listener but carries the input as its target — what the hook's
 * "is the user typing?" guard reads).
 */
function press(init: KeyboardEventInit, inInput = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init });
  if (!inInput) {
    window.dispatchEvent(event);
    return event;
  }
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.dispatchEvent(event);
  input.remove();
  return event;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  setUserAgent(realUserAgent);
  mocks.globalSelectedObject.object = null;
});

describe("useKeyboardShortcuts", () => {
  it("publishes ctrlPlusSPressed on Ctrl+S and prevents the default", () => {
    const handler = vi.fn();
    const sub = eventBus.subscribe("ctrlPlusSPressed", handler);
    renderHook(() => useKeyboardShortcuts());

    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    sub.dispose();
  });
});

describe("undo/redo chords", () => {
  it("undoes on Ctrl+Z and swallows the browser default", () => {
    renderHook(() => useKeyboardShortcuts());

    const event = press({ key: "z", ctrlKey: true });

    expect(mocks.historyService.undo).toHaveBeenCalledTimes(1);
    expect(mocks.historyService.redo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("redoes on Ctrl+Shift+Z", () => {
    renderHook(() => useKeyboardShortcuts());
    // Shift uppercases the key, which is why the handler lower-cases before comparing.
    press({ key: "Z", ctrlKey: true, shiftKey: true });

    expect(mocks.historyService.redo).toHaveBeenCalledTimes(1);
    expect(mocks.historyService.undo).not.toHaveBeenCalled();
  });

  it("redoes on Ctrl+Y", () => {
    renderHook(() => useKeyboardShortcuts());
    press({ key: "y", ctrlKey: true });

    expect(mocks.historyService.redo).toHaveBeenCalledTimes(1);
  });

  it("uses ⌘ instead of Ctrl on macOS", () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
    renderHook(() => useKeyboardShortcuts());

    press({ key: "z", ctrlKey: true });
    expect(mocks.historyService.undo).not.toHaveBeenCalled();

    press({ key: "z", metaKey: true });
    expect(mocks.historyService.undo).toHaveBeenCalledTimes(1);
  });

  it("ignores Z with no command modifier", () => {
    renderHook(() => useKeyboardShortcuts());
    press({ key: "z" });
    expect(mocks.historyService.undo).not.toHaveBeenCalled();
  });

  it("leaves Alt-carrying chords alone", () => {
    renderHook(() => useKeyboardShortcuts());
    press({ key: "z", ctrlKey: true, altKey: true });
    expect(mocks.historyService.undo).not.toHaveBeenCalled();
  });

  // The deliberate difference from the metamodeling twin: inside an attribute input,
  // Ctrl+Z belongs to the browser's own text-edit history.
  it("stands down inside a text field so the browser can undo the typing", () => {
    renderHook(() => useKeyboardShortcuts());
    press({ key: "z", ctrlKey: true }, true);
    expect(mocks.historyService.undo).not.toHaveBeenCalled();
  });

  it("still handles Ctrl+S inside a text field", () => {
    const handler = vi.fn();
    const sub = eventBus.subscribe("ctrlPlusSPressed", handler);
    renderHook(() => useKeyboardShortcuts());

    press({ key: "s", ctrlKey: true }, true);

    expect(handler).toHaveBeenCalledTimes(1);
    sub.dispose();
  });
});

describe("arrow-key nudge", () => {
  it("records one coalesced transform step per nudged object", () => {
    mocks.globalSelectedObject.object = { uuid: "obj-1" };
    const handler = vi.fn();
    const sub = eventBus.subscribe("historyRecord", handler);
    renderHook(() => useKeyboardShortcuts());

    press({ key: "ArrowLeft" });

    expect(handler).toHaveBeenCalledWith({
      label: "nudge",
      afterTransformSync: true,
      coalesceKey: "nudge:obj-1",
    });
    sub.dispose();
  });

  it("records nothing when there is no selection", () => {
    const handler = vi.fn();
    const sub = eventBus.subscribe("historyRecord", handler);
    renderHook(() => useKeyboardShortcuts());

    press({ key: "ArrowLeft" });

    expect(handler).not.toHaveBeenCalled();
    sub.dispose();
  });
});
