// @vitest-environment jsdom
// P11: UserLegend renders the ACTIVE tab's presence — chips per collaborator + the
// disconnect banner. No mocks needed: it reads only collabStore + tabsStore (it has no
// engine or service imports, which is the point of the store-mirror design).
//
// The tab-switch test is the important one: P10's AutoSave bug was exactly this —
// an "is the active tab shared?" question that subscribed to the collab state but not
// to the tab selection, so it went stale when the user switched tabs.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import UserLegend from "./UserLegend";
import { useCollabStore, type CollabUser, type TabCollabState } from "@/resources/store/collabStore";
import { useTabsStore } from "@/resources/store/tabsStore";

const alice: CollabUser = {
  clientId: 1,
  uuid: "u-1",
  username: "alice",
  color: "#ff0000",
  initials: "AL",
  isLocal: true,
};
const bob: CollabUser = {
  clientId: 2,
  uuid: "u-2",
  username: "bob",
  color: "#00ff00",
  initials: "BO",
  isLocal: false,
};

const tabState = (patch: Partial<TabCollabState> = {}): TabCollabState => ({
  status: "connected",
  access: "edit",
  banner: null,
  users: [],
  ...patch,
});

function seedTabs(count: number, selected: number) {
  useTabsStore.setState({
    tabs: Array.from({ length: count }, (_, i) => ({ name: `Tab ${i}`, uuid: `scene-${i}`, isShared: false })),
    selectedTab: selected,
  });
}

beforeEach(() => {
  // No auto-cleanup: vitest `globals` is off in this repo, so testing-library cannot
  // register its afterEach hook (the same reason AutoSave.test.tsx calls it by hand).
  cleanup();
  useCollabStore.setState({ tabs: {} });
  seedTabs(1, 0);
});

describe("UserLegend", () => {
  it("renders nothing when the active tab is not shared", () => {
    const { container } = render(<UserLegend />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a chip per collaborator with their initials", () => {
    useCollabStore.setState({ tabs: { 0: tabState({ users: [alice, bob] }) } });
    render(<UserLegend />);

    expect(screen.getByText("AL")).toBeTruthy();
    expect(screen.getByText("BO")).toBeTruthy();
  });

  it("marks the local user's chip as '(you)' and leaves peers plain", () => {
    useCollabStore.setState({ tabs: { 0: tabState({ users: [alice, bob] }) } });
    render(<UserLegend />);

    expect(screen.getByLabelText("alice (you)")).toBeTruthy();
    expect(screen.getByLabelText("bob")).toBeTruthy();
  });

  it("shows the disconnect banner when the session set one", () => {
    useCollabStore.setState({
      tabs: { 0: tabState({ status: "disconnected", access: "read", banner: "Disconnected — reconnecting…" }) },
    });
    render(<UserLegend />);

    expect(screen.getByText("Disconnected — reconnecting…")).toBeTruthy();
  });

  it("re-renders when awareness updates the user list (the store push replaces the poll)", () => {
    useCollabStore.setState({ tabs: { 0: tabState({ users: [alice] }) } });
    render(<UserLegend />);
    expect(screen.queryByText("BO")).toBeNull();

    // What shared-doc-service's awareness 'change' handler does when bob joins.
    act(() => useCollabStore.getState().setUsers(0, [alice, bob]));

    expect(screen.getByText("BO")).toBeTruthy();
  });

  it("follows the selected tab: a shared tab's chips vanish when switching to a plain tab", () => {
    seedTabs(2, 0);
    useCollabStore.setState({ tabs: { 0: tabState({ users: [alice] }) } });
    const { container } = render(<UserLegend />);
    expect(screen.getByText("AL")).toBeTruthy();

    // Tab 1 has no collab entry -> not shared -> the legend must empty out. Missing the
    // selectedTab subscription would leave alice's chip on screen (P10's AutoSave bug).
    act(() => useTabsStore.setState({ selectedTab: 1 }));

    expect(container.firstChild).toBeNull();
  });

  it("shows the newly selected tab's own collaborators", () => {
    seedTabs(2, 0);
    useCollabStore.setState({ tabs: { 0: tabState({ users: [alice] }), 1: tabState({ users: [bob] }) } });
    render(<UserLegend />);
    expect(screen.getByText("AL")).toBeTruthy();

    act(() => useTabsStore.setState({ selectedTab: 1 }));

    expect(screen.getByText("BO")).toBeTruthy();
    expect(screen.queryByText("AL")).toBeNull();
  });
});
