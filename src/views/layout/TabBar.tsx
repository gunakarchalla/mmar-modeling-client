import { SyntheticEvent, useState, KeyboardEvent } from "react";
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useTabsStore } from "@/resources/store/tabsStore";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { switchToTab, closeTab, renameTab } from "./tabActions";

// The tab bar: one tab per open scene (
// tabContext). Each tab shows the SceneInstance name + a close ×. Selecting a tab
// runs switchToTab (engine scene swap + store), closing runs closeTab. Both keep
// tabsStore and globalObject.tabContext in sync (see tabActions).
//
// Right-clicking a tab opens a context menu with "Rename SceneInstance", which pops a
// small dialog; confirming runs renameTab (engine + tree + store + PATCH, see tabActions).
export default function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const selectedTab = useTabsStore((s) => s.selectedTab);

  // Context menu anchored at the cursor for a specific tab index.
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  // Rename dialog state: the tab being renamed + the in-progress name value.
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null);

  function handleChange(_e: SyntheticEvent, value: number) {
    void switchToTab(value);
  }

  function handleClose(e: SyntheticEvent, index: number) {
    e.stopPropagation();
    void closeTab(index);
  }

  function handleContextMenu(e: SyntheticEvent<HTMLElement, MouseEvent>, index: number) {
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
        sx={{ minHeight: 40, height: "100%" }}
      >
        {tabs.map((tab, index) => (
          <Tab
            key={tab.uuid}
            value={index}
            onContextMenu={(e) => handleContextMenu(e, index)}
            sx={{ minHeight: 40, textTransform: "none", pr: 0.5 }}
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {tab.name || "(unnamed)"}
                <IconButton
                  component="span"
                  size="small"
                  onClick={(e) => handleClose(e, index)}
                  aria-label={`close ${tab.name}`}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            }
          />
        ))}
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
