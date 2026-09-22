import { useEffect } from "react";
import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import TopNavBar from "@/views/top-nav-bar/TopNavBar";
import Toolbar from "@/views/toolbar/Toolbar";
import TabBar from "@/views/layout/TabBar";
import StateWindow from "@/views/state-window/StateWindow";
import LeftNav from "@/views/left-nav/LeftNav";
import RightNav from "@/views/right-nav/RightNav";
import ThreeCanvas from "@/views/three-canvas/ThreeCanvas";
import XrButton from "@/views/three-canvas/XrButton";
import AppFooter from "@/views/footer/AppFooter";
import SignInDialog from "@/views/auth/SignInDialog";
import AppSnackbar from "@/views/common/AppSnackbar";
import LoadingWindow from "@/views/dialogs/LoadingWindow";
import CreateNewSceneDialog from "@/views/dialogs/CreateNewSceneDialog";
import SaveAsDialog from "@/views/dialogs/SaveAsDialog";
import CopySceneDialog from "@/views/dialogs/CopySceneDialog";
import DeleteSceneDialog from "@/views/dialogs/DeleteSceneDialog";
import ImportModelDialog from "@/views/dialogs/ImportModelDialog";
import ImportMetamodelDialog from "@/views/dialogs/ImportMetamodelDialog";
import MapFromFileDialog from "@/views/dialogs/MapFromFileDialog";
import UserInfoDialog from "@/views/dialogs/UserInfoDialog";
import ShareSceneDialog from "@/views/dialogs/ShareSceneDialog";
import AlgorithmDialog from "@/views/dialogs/AlgorithmDialog";
import { useAuthStore } from "@/resources/store/authStore";
import { useUiStore } from "@/resources/store/uiStore";
import { eventBus } from "@/resources/services/event-bus";
import { useKeyboardShortcuts } from "@/views/hooks/useKeyboardShortcuts";

// Draggable divider between the three body columns. The library handles the drag
// mechanics; the `useDefaultLayout` hook below persists the column widths.
const ResizeHandle = styled(Separator)(({ theme }) => ({
  width: 5,
  flex: "0 0 auto",
  backgroundColor: theme.palette.divider,
  cursor: "col-resize",
  transition: theme.transitions.create("background-color"),
  "&:hover, &:active": {
    backgroundColor: theme.palette.primary.main,
  },
}));

// The whole page skeleton: the top nav, the toolbar row, the tab row (tabs | state
// window), the resizable three-column body (LeftNav | ThreeCanvas | RightNav), the
// footer, and the always-present overlays (sign-in dialog and snackbar). Every dialog
// in the app is mounted here and shows itself from `uiStore`.
//
// The body is gated behind authentication; the sign-in dialog opens itself when no user
// is logged in. The engine boots inside ThreeCanvas, not here. AppLayout owns the
// app-level keyboard shortcuts and the Ctrl+S to Save-dialog wiring.
export default function AppLayout() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const openDialog = useUiStore((s) => s.openDialog);

  // Mount the app-wide keyboard shortcuts once (Delete, arrows, Ctrl+S, undo/redo).
  useKeyboardShortcuts();

  // Remembers the column widths across reloads. v4 removed `autoSaveId`; this hook
  // is its replacement and still persists to localStorage under the same id. The
  // body below is rendered conditionally, so the hook stays up here unconditionally.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "mmar-modeling-panels",
  });

  // Ctrl+S publishes `ctrlPlusSPressed` (from useKeyboardShortcuts); the old
  // top-nav-bar opened the Save dialog on that event. Wire it to the uiStore saveAs
  // dialog. The subscription is torn down on unmount.
  useEffect(() => {
    const sub = eventBus.subscribe("ctrlPlusSPressed", () => openDialog("saveAs"));
    return () => sub.dispose();
  }, [openDialog]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopNavBar />

      {currentUser ? (
        <>
          {/* Toolbar row */}
          <Box sx={{ height: 40, flex: "0 0 auto", backgroundColor: "#f5f5f5", borderBottom: "1px solid #bdbdbd" }}>
            <Toolbar />
          </Box>

          {/* Tab row: tab bar (left) + state window (right) */}
          <Box sx={{ height: 52, flex: "0 0 auto", display: "flex", borderBottom: "1px solid #bdbdbd" }}>
            <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <TabBar />
            </Box>
            <Box sx={{ width: 220, flex: "0 0 auto", borderLeft: "1px solid #bdbdbd" }}>
              <StateWindow />
            </Box>
          </Box>

          {/* Main 3-column body */}
          <Group
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            style={{ flex: 1, minHeight: 0 }}
          >
            <Panel id="left-nav" defaultSize="20" minSize="0" maxSize="35">
              <LeftNav />
            </Panel>
            <ResizeHandle />
            <Panel id="canvas" minSize="30">
              {/* The 3D canvas fills the panel; the AR/VR entry button is an
                  absolutely-positioned overlay on top of it. */}
              <Box sx={{ position: "relative", height: "100%", width: "100%", backgroundColor: "#ffffff" }}>
                <ThreeCanvas />
                <XrButton />
              </Box>
            </Panel>
            <ResizeHandle />
            <Panel id="right-nav" defaultSize="22" minSize="0" maxSize="40">
              <RightNav />
            </Panel>
          </Group>
        </>
      ) : (
        <Box sx={{ flex: 1 }} />
      )}

      <AppFooter />

      {/* Non-dismissable sign-in dialog: opens whenever nobody is authenticated. */}
      <SignInDialog open={!currentUser} onClose={() => undefined} />
      <AppSnackbar />

      {/* Loading window (driven by uiStore.loading) + create-new-scene. */}
      <LoadingWindow />
      <CreateNewSceneDialog />

      {/* Model-operation dialogs. All are uiStore-driven and render closed until
          something opens their flag (the File menu, a scene-tree context menu, the
          Info button, Ctrl+S). The attribute dialogs deliberately live inside
          AttributeWindow instead, next to the state they act on. */}
      <SaveAsDialog />
      <CopySceneDialog />
      <DeleteSceneDialog />
      <ImportModelDialog />
      <ImportMetamodelDialog />
      <MapFromFileDialog />
      <UserInfoDialog />
      <ShareSceneDialog />
      <AlgorithmDialog />
    </Box>
  );
}
