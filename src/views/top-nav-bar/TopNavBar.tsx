import { useState, MouseEvent } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Icon,
  Box,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { engine, globalSelectedObject, globalStateObject } from "@/engine";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { useUiStore, DialogName } from "@/resources/store/uiStore";

interface MenuItemDef {
  label: string;
  icon: string;
  disabled?: boolean;
  /** Opens a uiStore dialog when selected. */
  dialog?: DialogName;
  /** Non-dialog action (export, simulation). */
  onSelect?: () => void;
}
interface MenuDef {
  name: string;
  icon: string;
  items: MenuItemDef[];
}

// The menu bar's contents. An entry either opens a dialog (all of which are rendered
// from AppLayout) or runs an action directly. Entries marked disabled are placeholders
// for features that are not implemented; they are kept so the menu structure stays
// complete.
function buildMenus(openDialog: (name: DialogName) => void): MenuDef[] {
  const enterSimulation = () => {
    if (!engine.isInitialized) return;
    globalSelectedObject.removeObject();
    globalStateObject.setState(4);
    eventBus.publish("removeAttributeGui");
  };
  const exitSimulation = () => {
    if (!engine.isInitialized) return;
    globalSelectedObject.removeObject();
    globalStateObject.setState(1);
  };

  return [
    {
      name: "File",
      icon: "folder",
      items: [
        { label: "Save Model", icon: "save", dialog: "saveAs" },
        {
          label: "Export Model as .json",
          icon: "folder_special",
          onSelect: () =>
            void persistencyHandler
              .saveToTextfile()
              .catch((err) => logger.log(describeError(err), "error")),
        },
        { label: "Import Model", icon: "upload", dialog: "importModel" },
        { label: "Import Metamodel", icon: "upload", dialog: "importMetamodel" },
        { label: "Map file to SceneInstance", icon: "upload", dialog: "mapFromFile" },
        {
          label: "Export Open Models",
          icon: "folder_special",
          onSelect: () =>
            void persistencyHandler
              .saveAllOpenModelInstancesToTextfile()
              .catch((err) => logger.log(describeError(err), "error")),
        },
      ],
    },
    {
      name: "View",
      icon: "visibility",
      items: [
        { label: "Zoom In", icon: "zoom_in", disabled: true },
        { label: "Zoom Out", icon: "zoom_out", disabled: true },
        { label: "Zoom to Fit", icon: "zoom_out_map", disabled: true },
        { label: "Zoom to Selection", icon: "center_focus_strong", disabled: true },
      ],
    },
    {
      name: "Edit",
      icon: "edit",
      items: [
        { label: "Undo", icon: "undo", disabled: true },
        { label: "Redo", icon: "redo", disabled: true },
        { label: "Copy", icon: "file_copy", disabled: true },
        { label: "Paste", icon: "content_paste", disabled: true },
        { label: "Cut", icon: "content_cut", disabled: true },
      ],
    },
    {
      name: "Diagram",
      icon: "schema",
      items: [
        { label: "Check Rule Current Object", icon: "rule", disabled: true },
        { label: "Check Rule For Model", icon: "rule_folder", disabled: true },
        { label: "...", icon: "folder", disabled: true },
      ],
    },
    {
      name: "Settings",
      icon: "settings",
      items: [{ label: "Open Settings", icon: "toggle_on", disabled: true }],
    },
    {
      name: "Simulation",
      icon: "play_circle",
      items: [
        { label: "Enter Simulation Mode", icon: "play_arrow", onSelect: enterSimulation },
        { label: "Exit Simulation Mode", icon: "stop", onSelect: exitSimulation },
      ],
    },
  ];
}

function MenuEntry({
  menu,
  openDialog,
}: {
  menu: MenuDef;
  openDialog: (name: DialogName) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  function handleClick(item: MenuItemDef) {
    setAnchorEl(null);
    if (item.disabled) return;
    if (item.dialog) openDialog(item.dialog);
    item.onSelect?.();
  }

  return (
    <>
      <Button
        color="inherit"
        startIcon={<Icon>{menu.icon}</Icon>}
        onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
      >
        {menu.name}
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        {menu.items.map((item) => (
          <MenuItem key={item.label} disabled={item.disabled} onClick={() => handleClick(item)}>
            <ListItemIcon>
              <Icon>{item.icon}</Icon>
            </ListItemIcon>
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

// The menu bar itself. The title, the
// five menus, the Algorithms button and the Simulation menu. Ctrl+S -> Save dialog
// is wired in AppLayout (it owns the keyboard hook + the ctrlPlusSPressed bus).
export default function TopNavBar() {
  const openDialog = useUiStore((s) => s.openDialog);
  const menus = buildMenus(openDialog);

  return (
    <AppBar position="static" elevation={0} sx={{ backgroundColor: "#bdbdbd", color: "#000" }}>
      <Toolbar variant="dense" sx={{ gap: 0.5 }}>
        <Typography variant="h6" noWrap sx={{ mr: 2 }}>
          MMAR Modeling Client
        </Typography>

        <Box sx={{ display: "flex", flexGrow: 1, alignItems: "center" }}>
          {menus.slice(0, 5).map((menu) => (
            <MenuEntry key={menu.name} menu={menu} openDialog={openDialog} />
          ))}

          <Button
            color="inherit"
            startIcon={<PlayArrowIcon />}
            onClick={() => openDialog("algorithm")}
          >
            Algorithms
          </Button>

          {/* Simulation menu (last entry) */}
          <MenuEntry menu={menus[5]} openDialog={openDialog} />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
