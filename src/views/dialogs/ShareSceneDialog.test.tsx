// @vitest-environment jsdom
//
// P10 component tests for ShareSceneDialog: the access list renders, only a 'delete'
// holder may manage it, and add/remove map the HTTP statuses onto the original's error
// messages (which is why backend-service throws ApiError for these three endpoints).
//
// The dialog has no scene picker — the tree's Share context-menu item hands it the
// scene as a `{ sceneInstance }` payload, and it opens straight onto that scene's
// access list.
//
// Test traps observed (P8/P9 notes): close every uiStore dialog in beforeEach (the
// flags AND the payloads are module-global and leak); MUI's Select is not reachable via
// getByLabelText — open it by role and pick from the listbox.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  globalObject: {
    // A JWT payload for uuid 'me' — the dialog decodes it to hide its own delete button.
    accessToken: `header.${Buffer.from(JSON.stringify({ uuid: "me", username: "admin" })).toString("base64url")}.sig`,
  } as any,
  backendService: {
    sceneAccessListGET: vi.fn(async (): Promise<unknown[]> => []),
    sceneAccessMeGET: vi.fn(async (): Promise<{ level: string | null }> => ({ level: null })),
    sceneAccessPOST: vi.fn(async (): Promise<unknown> => ({})),
    sceneAccessDELETE: vi.fn(async (): Promise<void> => undefined),
    userByUsernameGET: vi.fn(async (): Promise<unknown> => ({})),
  },
  logger: { log: vi.fn() },
}));

vi.mock("@/engine", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));

import ShareSceneDialog from "./ShareSceneDialog";
import { useUiStore } from "@/resources/store/uiStore";
import { ApiError } from "@/resources/services/api";
import { eventBus } from "@/resources/services/event-bus";

const SCENE_UUID = "si-1";

const entry = (over: Record<string, unknown> = {}) => ({
  uuid_user: "u1",
  username: "alice",
  displayname: "Alice A",
  read_access: true,
  edit_access: false,
  delete_access: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  // uiStore dialog flags are module-global and leak across tests — close them all.
  const dialogs = useUiStore.getState().dialogs;
  useUiStore.setState({
    dialogs: Object.fromEntries(Object.keys(dialogs).map((name) => [name, false])) as typeof dialogs,
    // Payloads leak the same way the flags do, and a stale one silently switches the
    // dialog into prefilled mode for the next test.
    dialogPayloads: {},
  });
  mocks.backendService.sceneAccessListGET.mockResolvedValue([]);
  mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: null });
});

/** Open the dialog on the one scene, exactly as the tree's Share menu item does. */
async function openScene() {
  useUiStore
    .getState()
    .openDialog("shareScene", { sceneInstance: { uuid: SCENE_UUID, name: "My Scene" } });
  render(<ShareSceneDialog />);
  // The access list load is what every test below builds on, and it starts on open now
  // rather than on a selection.
  await waitFor(() =>
    expect(mocks.backendService.sceneAccessListGET).toHaveBeenCalledWith(SCENE_UUID),
  );
}

describe("ShareSceneDialog", () => {
  it("lists the scene's access entries with their level pill", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([
      entry(),
      entry({ uuid_user: "u2", username: "bob", displayname: "bob", edit_access: true, delete_access: true }),
    ]);

    await openScene();

    await waitFor(() => expect(screen.getByText("alice")).toBeTruthy());
    expect(mocks.backendService.sceneAccessListGET).toHaveBeenCalledWith(SCENE_UUID);
    expect(screen.getByText("bob")).toBeTruthy();
    // levelLabel collapses the flags to the highest level granted.
    expect(screen.getByText("read")).toBeTruthy();
    expect(screen.getByText("delete")).toBeTruthy();
    // displayname is only shown when it differs from the username.
    expect(screen.getByText("(Alice A)")).toBeTruthy();
  });

  it("hides the management UI from a user without delete access", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([entry()]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "edit" });

    await openScene();

    await waitFor(() => expect(screen.getByText("alice")).toBeTruthy());
    expect(screen.queryByText("Add user:")).toBeNull();
    expect(screen.queryByLabelText("Revoke access for alice")).toBeNull();
  });

  it("shows the management UI to a delete-access holder, but not a self-revoke button", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([
      entry(),
      entry({ uuid_user: "me", username: "admin", displayname: "admin", delete_access: true }),
    ]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "delete" });

    await openScene();

    await waitFor(() => expect(screen.getByText("Add user:")).toBeTruthy());
    expect(screen.getByLabelText("Revoke access for alice")).toBeTruthy();
    // We may not revoke ourselves (uuid_user === currentUserUuid).
    expect(screen.queryByLabelText("Revoke access for admin")).toBeNull();
  });

  it("grants access to a looked-up user and adds them to the list", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([entry()]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "delete" });
    mocks.backendService.userByUsernameGET.mockResolvedValue({ uuid: "u9", username: "carol", displayname: "carol" });
    mocks.backendService.sceneAccessPOST.mockResolvedValue(
      entry({ uuid_user: "u9", username: "carol", displayname: "carol" }),
    );

    await openScene();
    await waitFor(() => expect(screen.getByText("Add user:")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "carol" } });
    fireEvent.click(screen.getByText("Add user"));

    await waitFor(() => expect(screen.getByText("carol")).toBeTruthy());
    expect(mocks.backendService.sceneAccessPOST).toHaveBeenCalledWith(SCENE_UUID, {
      uuid_user: "u9",
      access: "read", // the default levelChoice
    });
  });

  it("publishes sceneAccessGranted so an open tab attaches its session without a reload", async () => {
    const publishSpy = vi.spyOn(eventBus, "publish");
    mocks.backendService.sceneAccessListGET.mockResolvedValue([entry()]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "delete" });
    mocks.backendService.userByUsernameGET.mockResolvedValue({ uuid: "u9", username: "carol", displayname: "carol" });
    mocks.backendService.sceneAccessPOST.mockResolvedValue(
      entry({ uuid_user: "u9", username: "carol", displayname: "carol" }),
    );

    await openScene();
    await waitFor(() => expect(screen.getByText("Add user:")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "carol" } });
    fireEvent.click(screen.getByText("Add user"));

    await waitFor(() =>
      expect(publishSpy).toHaveBeenCalledWith("sceneAccessGranted", { sceneInstanceUuid: SCENE_UUID }),
    );
    publishSpy.mockRestore();
  });

  it("turns a 404 from the user lookup into 'User not found'", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([entry()]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "delete" });
    mocks.backendService.userByUsernameGET.mockRejectedValue(new ApiError("nope", 404));

    await openScene();
    await waitFor(() => expect(screen.getByText("Add user:")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ghost" } });
    fireEvent.click(screen.getByText("Add user"));

    await waitFor(() => expect(screen.getByText("User not found")).toBeTruthy());
    expect(mocks.backendService.sceneAccessPOST).not.toHaveBeenCalled();
  });

  it("requires a username before granting", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([entry()]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "delete" });

    await openScene();
    await waitFor(() => expect(screen.getByText("Add user:")).toBeTruthy());
    fireEvent.click(screen.getByText("Add user"));

    await waitFor(() => expect(screen.getByText("Username is required")).toBeTruthy());
    expect(mocks.backendService.userByUsernameGET).not.toHaveBeenCalled();
  });

  it("revokes an entry and drops it from the list", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([entry()]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "delete" });

    await openScene();
    await waitFor(() => expect(screen.getByText("alice")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Revoke access for alice"));

    await waitFor(() => expect(screen.queryByText("alice")).toBeNull());
    expect(mocks.backendService.sceneAccessDELETE).toHaveBeenCalledWith(SCENE_UUID, "u1");
  });

  it("turns a 409 on revoke into the last-delete-owner message and keeps the row", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([entry()]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "delete" });
    mocks.backendService.sceneAccessDELETE.mockRejectedValue(new ApiError("conflict", 409));

    await openScene();
    await waitFor(() => expect(screen.getByText("alice")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Revoke access for alice"));

    await waitFor(() => expect(screen.getByText("Cannot remove the last delete owner")).toBeTruthy());
    expect(screen.getByText("alice")).toBeTruthy();
  });

  it("closes on Cancel", async () => {
    await openScene();
    fireEvent.click(await screen.findByText("Cancel"));
    expect(useUiStore.getState().dialogs.shareScene).toBe(false);
  });
});

describe("ShareSceneDialog — no picker", () => {
  it("names the scene instead of offering a way to re-choose it", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([entry()]);
    await openScene();

    expect(screen.getByText(/Sharing/)).toBeTruthy();
    // The only combobox left is the access-level one, and it appears only for a manager.
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("stays shut when opened with no scene", async () => {
    render(<ShareSceneDialog />);
    useUiStore.getState().openDialog("shareScene");

    // No picker to fall back to: an unpayloaded open is a caller bug, so the dialog
    // renders nothing and the mistake goes to the log instead of the user.
    await waitFor(() => expect(screen.queryByText(/Sharing/)).toBeNull());
    expect(mocks.backendService.sceneAccessListGET).not.toHaveBeenCalled();
  });
});
