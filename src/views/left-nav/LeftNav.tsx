import { useState } from "react";
import { Box, Divider, Tab, Tabs } from "@mui/material";
import { useTabsStore } from "@/resources/store/tabsStore";
import SceneGroup from "@/views/scenegroup/SceneGroup";
import ModelTree from "@/views/model-tree/ModelTree";
import ClassButtonGroup from "@/views/palette/ClassButtonGroup";
import RelationclassButtonGroup from "@/views/palette/RelationclassButtonGroup";

// Left column: a tab strip over two views.
//  - "Scenes": the scene tree (SceneTypes / SceneInstances) plus the class and
//    relation-class palettes — the palettes only once a scene tab is open.
//  - "Model tree": a treeview of the objects in the open scene instance, grouped by
//    metaclass; clicking a row selects that object on the canvas.
//
// Both panels stay mounted (the inactive one hidden) so SceneGroup's init effect and
// bus subscriptions are not torn down every time the user switches tabs. The model tree
// is told when it is hidden, and defers its rebuilds until it is shown again.
export default function LeftNav() {
  const openTab = useTabsStore((s) => s.selectedTab >= 0 && s.tabs.length > 0);
  const [active, setActive] = useState<"scenes" | "modelTree">("scenes");

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Tabs
        value={active}
        onChange={(_, value) => setActive(value)}
        variant="fullWidth"
        sx={{ minHeight: 36, flex: "0 0 auto", borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Tab value="scenes" label="Scenes" sx={{ minHeight: 36, fontSize: "9pt" }} />
        <Tab value="modelTree" label="Model tree" sx={{ minHeight: 36, fontSize: "9pt" }} />
      </Tabs>

      <Box sx={{ flex: 1, overflowY: "auto", p: 1, minHeight: 0 }} hidden={active !== "scenes"}>
        <SceneGroup />

        {openTab && (
          <>
            <Divider sx={{ my: 1 }} />
            <ClassButtonGroup />
            <Divider sx={{ my: 1 }} />
            <RelationclassButtonGroup />
          </>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }} hidden={active !== "modelTree"}>
        <ModelTree active={active === "modelTree"} />
      </Box>
    </Box>
  );
}
