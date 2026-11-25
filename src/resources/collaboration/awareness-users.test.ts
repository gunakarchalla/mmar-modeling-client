// P11: collectUsers is the data half of the old user-legend's refresh() — awareness
// states in, legend rows out. Pure, so no mocks are needed at all.
import { describe, it, expect } from "vitest";
import { collectUsers } from "./awareness-users";

function awareness(clientID: number, states: Record<number, unknown>) {
  return {
    clientID,
    getStates: () => new Map(Object.entries(states).map(([k, v]) => [Number(k), v])),
  } as Parameters<typeof collectUsers>[0];
}

const alice = { user: { uuid: "u-1", username: "alice", color: "#ff0000", initials: "AL" } };
const bob = { user: { uuid: "u-2", username: "bob", color: "#00ff00", initials: "BO" } };

describe("collectUsers", () => {
  it("maps each awareness state to a legend row", () => {
    const users = collectUsers(awareness(1, { 1: alice, 2: bob }));

    expect(users).toHaveLength(2);
    expect(users[0]).toEqual({
      clientId: 1,
      uuid: "u-1",
      username: "alice",
      color: "#ff0000",
      initials: "AL",
      isLocal: true,
    });
    expect(users[1].username).toBe("bob");
  });

  it("flags only the local client, so the legend can outline our own chip", () => {
    const users = collectUsers(awareness(2, { 1: alice, 2: bob }));

    expect(users.find((u) => u.clientId === 1)?.isLocal).toBe(false);
    expect(users.find((u) => u.clientId === 2)?.isLocal).toBe(true);
  });

  it("skips states with no user identity (a peer that has only published a cursor)", () => {
    const users = collectUsers(awareness(1, { 1: alice, 2: { cursor: { active: true } }, 3: {} }));

    expect(users.map((u) => u.clientId)).toEqual([1]);
  });

  it("falls back for missing user fields rather than rendering an empty chip", () => {
    const users = collectUsers(awareness(9, { 1: { user: { uuid: "u-3" } } }));

    expect(users[0]).toMatchObject({
      username: "u-3", // falls back to the uuid
      initials: "?",
      color: "hsl(0, 70%, 55%)",
      isLocal: false,
    });
  });

  it("returns an empty list when nobody is connected", () => {
    expect(collectUsers(awareness(1, {}))).toEqual([]);
  });
});
