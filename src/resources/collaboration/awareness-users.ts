import type { WebsocketProvider } from "y-websocket";
import type { CollabUser } from "@/resources/store/collabStore";

/**
 * The data half of the user legend: turns a session's awareness states into the rows the
 * legend renders (`views/user-legend/UserLegend.tsx` draws the chips).
 *
 * `shared-doc-service` subscribes to awareness `change` once per session and pushes the
 * result into `collabStore`, so the list updates as peers join and leave.
 */

type AwarenessLike = Pick<WebsocketProvider["awareness"], "clientID" | "getStates">;

interface AwarenessUser {
  uuid?: string;
  username?: string;
  color?: string;
  initials?: string;
}

/**
 * Map a session's awareness states to the legend's rows, including the local client
 * (flagged `isLocal`). States without a `user.uuid` are skipped: a peer publishes its
 * cursor and selection fields before its user field is decoded, and a chip with no
 * identity is meaningless.
 */
export function collectUsers(awareness: AwarenessLike): CollabUser[] {
  const localId = awareness.clientID;
  const users: CollabUser[] = [];

  for (const [clientId, state] of Array.from(awareness.getStates())) {
    const user = (state as { user?: AwarenessUser } | undefined)?.user;
    if (!user?.uuid) continue;
    users.push({
      clientId,
      uuid: user.uuid,
      username: user.username ?? user.uuid,
      color: user.color ?? "hsl(0, 70%, 55%)",
      initials: user.initials ?? "?",
      isLocal: clientId === localId,
    });
  }

  return users;
}
