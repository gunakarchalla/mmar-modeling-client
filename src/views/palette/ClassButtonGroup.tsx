import { globalObject, globalClassObject } from "@/engine";
import PaletteButtonGroup from "./PaletteButtonGroup";

// The class palette: the classes of the active tab's scene type. Selecting a button
// arms that class on `globalClassObject` and enters drawing mode.
export default function ClassButtonGroup() {
  return (
    <PaletteButtonGroup
      title="Classes"
      getMetaObjects={() => globalObject.tabContext[globalObject.selectedTab]?.sceneType?.classes}
      onSelect={(uuid) => globalClassObject.setSelectedClassByUUID(uuid)}
      stateToEnter={2}
    />
  );
}
