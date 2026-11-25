import { SyntheticEvent, useMemo, useState, KeyboardEvent, MouseEvent } from "react";
import {
  Box,
  Tabs,
  Tab,
  tabsClasses,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useTabsStore, orderedTabIndices } from "@/resources/store/tabsStore";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { switchToTab, closeTab, renameTab } from "./tabActions";
import { useTabDrag, slideOffset } from "./useTabDrag";

/**
 * Width (px) of every tab. One fixed width, whatever the name, puts each close button
 * at a fixed spacing: close a tab and the next one slides into its place with its ×
 * under the pointer, so a row of tabs closes with repeated clicks on one spot.
 */
export const TAB_WIDTH = 180;

// The tab bar: one tab per open scene (tabContext). Each tab shows the SceneInstance
// name + a close ×. Selecting a tab runs switchToTab (engine scene swap + store),
// closing runs closeTab. Both keep tabsStore and globalObject.tabContext in sync (see
// tabActions). A middle click closes a tab too, as in a browser.
//
// Tabs are shown in `tabsStore.displayOrder`, which dragging a tab changes. Every index
// handed to tabActions is still the tab's OPEN-order index (`value`), never its
// position on the bar.
//
// Right-clicking a tab opens a context menu with "Rename SceneInstance", which pops a
// small dialog; confirming runs renameTab (engine + tree + store + PATCH, see tabActions).
export default function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const selectedTab = useTabsStore((s) => s.selectedTab);
  const displayOrder = useTabsStore((s) => s.displayOrder);
  const ordered = useMemo(() => orderedTabIndices(tabs, displayOrder), [tabs, displayOrder]);
  const theme = useTheme();
  const slideTransition = theme.transitions.create("transform", {
    duration: theme.transitions.duration.shortest,
  });

  // Context menu anchored at the cursor for a specific tab index.
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  // Rename dialog state: the tab being renamed + the in-progress name value.
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null);

  // A dropped tab is reordered and becomes the active tab, as in a browser.
  const { drag, onPointerDown } = useTabDrag(ordered.length, TAB_WIDTH, (uuid, slot) => {
    const store = useTabsStore.getState();
    store.moveTab(uuid, slot);
    const index = store.tabs.findIndex((tab) => tab.uuid === uuid);
    if (index !== -1 && index !== store.selectedTab) void switchToTab(index);
  });

  function handleChange(_e: SyntheticEvent, value: number) {
    void switchToTab(value);
  }

  function handleClose(e: SyntheticEvent, index: number) {
    e.stopPropagation();
    void closeTab(index);
  }

  function handleAuxClick(e: MouseEvent<HTMLElement>, index: number) {
    if (e.button !== 1) return;
    e.preventDefault();
    void closeTab(index);
  }

  function handleContextMenu(e: SyntheticEvent<HTMLElement, globalThis.MouseEvent>, index: number) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ index, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }

  function startRename() {
    if (!menu) return;
    const tab = tabs[menu.index];
    setRenaming({ index: menu.index, value: tab?.name ?? "" });
    setMenu(null);
  }

  function confirmRename() {
    if (!renaming) return;
    const { index, value } = renaming;
    setRenaming(null);
    void renameTab(index, value).catch((err) => logger.log(describeError(err), "error"));
  }

  function onRenameKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmRename();
    }
  }

  return (
    <>
      <Tabs
        value={selectedTab >= 0 && selectedTab < tabs.length ? selectedTab : false}
        onChange={handleChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 40,
          height: "100%",
          // Stretch the tabs to the full row height, so each tab's own underline sits on
          // the bottom edge of the row and its name is vertically centred.
          [`& .${tabsClasses.list}`]: { height: "100%" },
          // MUI's sliding indicator measures the selected tab and animates to it, which
          // would trail behind a dragged tab. Each tab draws its own underline instead.
          [`& .${tabsClasses.indicator}`]: { display: "none" },
        }}
      >
        {ordered.map((index, slot) => {
          const tab = tabs[index];
          const isDragged = drag?.uuid === tab.uuid;
          const shift = !drag
            ? 0
            : isDragged
              ? drag.offset
              : slideOffset(slot, drag.from, drag.to, drag.pitch);
          return (
            <Tab
              key={tab.uuid}
              value={index}
              onContextMenu={(e) => handleContextMenu(e, index)}
              onPointerDown={(e) => onPointerDown(e, tab.uuid, slot)}
              onAuxClick={(e) => handleAuxClick(e, index)}
              // Stop the middle button's autoscroll so its auxclick reaches the tab.
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              sx={{
                width: TAB_WIDTH,
                minWidth: TAB_WIDTH,
                maxWidth: TAB_WIDTH,
                minHeight: 40,
                p: 0,
                // MUI lays a Tab out as a column (room for an icon above the label), in
                // which "stretch" only widens the face. As a row, the face fills the tab
                // top to bottom, so its underline lands on the bottom edge of the bar.
                flexDirection: "row",
                alignItems: "stretch",
                textTransform: "none",
                // The face below is drawn outside the tab while it is dragged or sliding.
                overflow: "visible",
              }}
              label={
                // The tab's visible "face". Drags move the face, not the Tab itself, so
                // MUI's Tabs never sees the selected tab move and never scrolls to chase it.
                <Box
                  // Per-frame drag values go inline: in `sx` every new pixel offset
                  // would mint (and keep) another Emotion class.
                  style={{
                    zIndex: isDragged ? 1 : undefined,
                    transform: shift ? `translateX(${shift}px)` : undefined,
                    // Neighbours slide aside; the dragged face tracks the pointer exactly.
                    // Off when no drag is running, so the drop's re-layout does not animate.
                    transition: drag && !isDragged ? slideTransition : undefined,
                  }}
                  sx={{
                    position: "relative",
                    width: "100%",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    pl: 1.5,
                    pr: 0.5,
                    bgcolor: "background.paper",
                    borderRight: 1,
                    borderColor: "divider",
                    // The selected tab's underline, plus a lift while it is being dragged.
                    boxShadow:
                      [
                        index === selectedTab ? `inset 0 -2px 0 ${theme.palette.primary.main}` : null,
                        isDragged ? theme.shadows[4] : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "none",
                  }}
                >
                  <Box
                    component="span"
                    title={tab.name || "(unnamed)"}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "left",
                    }}
                  >
                    {tab.name || "(unnamed)"}
                  </Box>
                  <IconButton
                    component="span"
                    size="small"
                    data-tab-close=""
                    onClick={(e) => handleClose(e, index)}
                    aria-label={`close ${tab.name}`}
                    sx={{ flexShrink: 0 }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            />
          );
        })}
      </Tabs>

      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        <MenuItem onClick={startRename}>Rename SceneInstance</MenuItem>
      </Menu>

      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Rename SceneInstance</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={renaming?.value ?? ""}
            onChange={(e) =>
              setRenaming((r) => (r ? { ...r, value: e.target.value } : r))
            }
            onKeyDown={onRenameKeyDown}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={confirmRename} disabled={!renaming?.value.trim()}>
            Rename
          </Button>
          <Button onClick={() => setRenaming(null)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
