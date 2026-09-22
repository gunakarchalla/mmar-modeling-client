import { UUID } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { logger } from "@/resources/services/logger";
import { metaUtility } from "@/resources/services/meta-utility";

/**
 * The palette's classes for the open scene type, and which of them is armed for
 * drawing. `initClasses()` flattens the scene type's classes into three parallel
 * arrays (name / geometry / uuid) so drawing does not have to walk the metamodel
 * again on every click.
 *
 * `getIcon` digs the palette button's image out of a vizRep code string: it prefers an
 * `icon` declaration and falls back to a `map`, accepting either an inline data-URL or
 * a `getImageByUUID(...)` reference resolved through the meta-utility file cache.
 */
export class GlobalClassObject {
  classUUID: UUID[];
  classNames: string[];
  classGeometry: string[];
  private selectedClass: string;
  private selectedClassUUID: UUID;

  private globalObjectInstance = globalObject;
  private logger = logger;

  constructor() {
    this.classNames = [];
    this.classGeometry = [];
    this.selectedClass = "";
    this.selectedClassUUID = "";
    this.classUUID = [];
  }

  initClasses() {
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    const tabContextClasses = tabContext["sceneType"].classes;
    //for each class
    for (const element of tabContextClasses) {
      this.classNames.push(element.name);
      this.classGeometry.push(JSON.stringify(element.geometry));
      this.classUUID.push(element.uuid);
    }
  }

  onObjectChange() {
    // push to log file
    this.logger.log(`The selected object has changed to ${this.getSelectedClass()}`, "info");
  }
  getSelectedClass() {
    return this.selectedClass;
  }
  getSelectedClassUUID() {
    return this.selectedClassUUID;
  }
  setSelectedClassByUUID(theUUID: string) {
    const index = this.classUUID.findIndex((uuid) => uuid === theUUID);
    this.selectedClass = this.classNames[index];
    this.selectedClassUUID = this.classUUID[index];
    this.onObjectChange();
  }

  async getIcon(wholeVizRep: string) {
    let vizRep: string;
    let map = "";
    let next = false;

    //if icon defined
    vizRep = wholeVizRep.split("let icon")[1];
    if (vizRep) {
      const arrStr: string[] = vizRep.split("'");
      for (const substring of arrStr) {
        const string: string = substring;
        if (string.startsWith("data")) {
          map = string;
          return map;
        } else if (string.endsWith("getImageByUUID(")) {
          next = true;
        } else if (next) {
          // Resolve the referenced file's data-URL from the meta-utility Files cache
          // (populated by metaUtility.getFiles() before the tree is built).
          const entry = metaUtility.Files.get(string);
          map = entry ? entry[1] : "";
          break;
        }
      }
    }

    //if icon not defined try to take map
    if (map == "") {
      vizRep = wholeVizRep.split("let map")[1];
      if (vizRep) {
        const arrStr: string[] = vizRep.split("'");
        for (const substring of arrStr) {
          const string: string = substring;
          if (string.startsWith("data")) {
            map = string;
            return map;
          }
        }
      }
    }

    return map;
  }
}

// Module singleton — one shared instance.
export const globalClassObject = new GlobalClassObject();
