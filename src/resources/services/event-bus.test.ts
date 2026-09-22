import { describe, it, expect, vi } from "vitest";
import { eventBus } from "./event-bus";

describe("eventBus", () => {
  it("delivers published payloads to subscribers", () => {
    const cb = vi.fn();
    const sub = eventBus.subscribe("sceneInstanceMutated", cb);
    eventBus.publish("sceneInstanceMutated", { sceneInstanceUuid: "abc" });
    expect(cb).toHaveBeenCalledWith({ sceneInstanceUuid: "abc" });
    sub.dispose();
  });

  it("stops delivering after dispose()", () => {
    const cb = vi.fn();
    const sub = eventBus.subscribe("tabChanged", cb);
    sub.dispose();
    eventBus.publish("tabChanged");
    expect(cb).not.toHaveBeenCalled();
  });

  it("supports void channels with no payload argument", () => {
    const cb = vi.fn();
    const sub = eventBus.subscribe("ctrlPlusSPressed", cb);
    eventBus.publish("ctrlPlusSPressed");
    expect(cb).toHaveBeenCalledTimes(1);
    sub.dispose();
  });

  it("is safe when a handler unsubscribes mid-dispatch", () => {
    const calls: string[] = [];
    const subA = eventBus.subscribe("login", () => {
      calls.push("a");
      subB.dispose();
    });
    const subB = eventBus.subscribe("login", () => calls.push("b"));
    eventBus.publish("login", true);
    expect(calls).toContain("a");
    subA.dispose();
    subB.dispose();
  });
});
