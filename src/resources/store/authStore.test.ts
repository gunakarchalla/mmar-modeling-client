import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the backend so login() does not hit the network. The mock returns a
// crafted JWT string that authStore decodes into currentUser.
vi.mock("@/resources/services/backend-service", () => ({
  backendService: {
    login: vi.fn(),
  },
}));

import { useAuthStore } from "./authStore";
import { backendService } from "@/resources/services/backend-service";
import { clearToken } from "@/resources/services/token";

function b64url(value: unknown): string {
  // base64url of the JSON, matching a JWT segment (no padding, URL-safe alphabet).
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.sig`;
}

describe("authStore.isJwtExpired", () => {
  it("treats a token with a past exp as expired", () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(useAuthStore.getState().isJwtExpired(token)).toBe(true);
  });

  it("treats a token with a future exp as valid", () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(useAuthStore.getState().isJwtExpired(token)).toBe(false);
  });

  it("treats a token without exp as not expired (matches user-management)", () => {
    const token = makeJwt({ username: "admin" });
    expect(useAuthStore.getState().isJwtExpired(token)).toBe(false);
  });
});

describe("authStore.login", () => {
  beforeEach(() => {
    clearToken();
    useAuthStore.setState({ currentUser: null });
    vi.mocked(backendService.login).mockReset();
  });

  it("hydrates currentUser from the returned JWT on success", async () => {
    const token = makeJwt({
      uuid: "u-1",
      username: "admin",
      isAdmin: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.mocked(backendService.login).mockResolvedValue(token);

    const ok = await useAuthStore.getState().login("admin", "admin");
    expect(ok).toBe(true);
    expect(useAuthStore.getState().currentUser).toEqual({
      uuid: "u-1",
      username: "admin",
      isAdmin: true,
    });
  });

  it("returns false and stays logged out when no token comes back", async () => {
    vi.mocked(backendService.login).mockResolvedValue(undefined);
    const ok = await useAuthStore.getState().login("admin", "wrong");
    expect(ok).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it("returns false when the backend throws (wrong credentials)", async () => {
    vi.mocked(backendService.login).mockRejectedValue(new Error("Login failed: 401"));
    const ok = await useAuthStore.getState().login("admin", "wrong");
    expect(ok).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });
});
