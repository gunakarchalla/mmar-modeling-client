import { create } from "zustand";
import { jwtDecode } from "jwt-decode";
import { backendService } from "@/resources/services/backend-service";
import { getToken, setToken, clearToken } from "@/resources/services/token";
import { eventBus } from "@/resources/services/event-bus";
import { useLogStore } from "./logStore";
import { describeError } from "@/resources/util/describe-error";

/** Decoded-JWT view of the logged-in user. */
export interface CurrentUser {
  uuid: string;
  username: string;
  isAdmin: boolean;
}

interface JwtPayload {
  uuid?: string;
  username?: string;
  isAdmin?: boolean;
  exp?: number;
}

function decode(token: string): JwtPayload {
  return jwtDecode<JwtPayload>(token);
}

function userFromToken(token: string): CurrentUser {
  const payload = decode(token);
  return {
    uuid: payload.uuid ?? "",
    username: payload.username ?? "",
    isAdmin: payload.isAdmin === true,
  };
}

/**
 * Authentication state. The token itself lives in `services/token.ts` (mirrored to
 * localStorage so a reload keeps the session); this store is its only writer and holds
 * the decoded user alongside it.
 */
interface AuthState {
  currentUser: CurrentUser | null;

  /** POST credentials, store the token, hydrate currentUser, publish `login`. */
  login: (username: string, password: string) => Promise<boolean>;
  /**
   * Drop the token and the current user, and publish `login` as false — which is what
   * `services/session-reset` tears the session down on.
   */
  logout: () => void;
  /** A token with no `exp` claim counts as valid. */
  isJwtExpired: (token: string) => boolean;
  /** Restore the session from the stored token; called once at import time. */
  restore: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,

  async login(username: string, password: string): Promise<boolean> {
    try {
      const token = await backendService.login(username, password);
      // A valid JWT is a non-empty string; anything else is a failed login.
      if (!token || typeof token !== "string") return false;
      setToken(token);
      set({ currentUser: userFromToken(token) });
      useLogStore.getState().log(`User ${username} logged in`, "info");
      // Announce the new session. The scene tree does not listen — SceneGroup builds it
      // when it mounts, which the body rendering for the new `currentUser` is what does.
      eventBus.publish("login", true);
      return true;
    } catch (error) {
      // Wrong credentials come back as a non-ok response, which backendService throws on.
      useLogStore.getState().log(`Login failed: ${describeError(error)}`, "error");
      return false;
    }
  },

  logout(): void {
    clearToken();
    set({ currentUser: null });
    // Publish BEFORE logging: `session-reset` subscribes to this channel and clears the
    // log panel (it names the departing user's scenes), so a line written first would be
    // wiped. Listeners run synchronously, so the teardown completes inside this call.
    eventBus.publish("login", false);
    useLogStore.getState().log("User logged out", "info");
  },

  isJwtExpired(token: string): boolean {
    const payload = decode(token);
    // No exp claim means the token does not expire.
    if (!payload.exp) return false;
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime > payload.exp;
  },

  restore(): void {
    const token = getToken();
    if (!token) return;
    if (get().isJwtExpired(token)) {
      clearToken();
      return;
    }
    set({ currentUser: userFromToken(token) });
  },
}));

// Hydrate currentUser from a stored token on page load.
useAuthStore.getState().restore();
