import { Box, Tooltip } from "@mui/material";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import { useCollabStore } from "@/resources/store/collabStore";
import { useTabsStore } from "@/resources/store/tabsStore";

/**
 * Shared presence for the ACTIVE tab: the disconnect banner, and one coloured chip per
 * connected collaborator (initials, username in the tooltip, the local user's chip
 * outlined). Renders nothing when the active tab is not shared.
 *
 * Fully reactive, with both triggers named explicitly:
 *   - `collabStore.tabs`      session attach and detach, status and banner changes, and
 *                             the awareness-driven user list;
 *   - `tabsStore.selectedTab` the user switching tabs.
 * Any "is the ACTIVE tab X" question needs the second trigger as much as the first —
 * without it the legend keeps rendering the previous tab's participants.
 */
export default function UserLegend() {
  const selectedTab = useTabsStore((s) => s.selectedTab);
  const collabTabs = useCollabStore((s) => s.tabs);

  const tab = selectedTab >= 0 ? collabTabs[selectedTab] : undefined;
  const banner = tab?.banner ?? null;
  const users = tab?.users ?? [];

  // Not shared and nothing to report -> render nothing, so the toolbar's
  // `if.bind` gates did.
  if (!tab && !banner) return null;

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      {banner && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: "2px",
            backgroundColor: "#b00020",
            color: "#fff",
            borderRadius: 1,
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          <SyncProblemIcon sx={{ fontSize: 16 }} />
          <Box component="span" sx={{ lineHeight: 1.2 }}>
            {banner}
          </Box>
        </Box>
      )}

      {tab && (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: "4px", px: "4px" }}>
          {users.map((u) => (
            <Tooltip key={u.clientId} title={`${u.username}${u.isLocal ? " (you)" : ""}`}>
              <Box
                component="span"
                aria-label={`${u.username}${u.isLocal ? " (you)" : ""}`}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: u.color,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "default",
                  userSelect: "none",
                  flexShrink: 0,
                  ...(u.isLocal ? { outline: "2px solid #fff", outlineOffset: "1px" } : {}),
                }}
              >
                {u.initials}
              </Box>
            </Tooltip>
          ))}
        </Box>
      )}
    </Box>
  );
}
