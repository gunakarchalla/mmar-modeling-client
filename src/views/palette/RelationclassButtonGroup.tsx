import { globalObject, globalRelationclassObject } from "@/engine";
import PaletteButtonGroup from "./PaletteButtonGroup";

// The relation-class palette: selecting a button sets the armed relation class on
// globalRelationclassObject and entered DrawingModeRelationClass (state 3).
export default function RelationclassButtonGroup() {
  return (
    <PaletteButtonGroup
      title="Relationclasses"
      getMetaObjects={() =>
        globalObject.tabContext[globalObject.selectedTab]?.sceneType?.relationclasses
      }
      onSelect={(uuid) => globalRelationclassObject.setSelectedRelationClassByUUID(uuid)}
      stateToEnter={3}
    />
  );
}
