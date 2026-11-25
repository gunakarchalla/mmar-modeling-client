import { RelationclassInstance, UUID } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { logger } from "@/resources/services/logger";

/**
 * The palette's relation classes for the open scene type, and which of them is armed
 * for drawing — the relation counterpart of `globalClassObject`.
 *
 * `relationclassInstanceInCreation` holds the relation being drawn between the first
 * click and the closing one, so a right-click can delete a half-finished relation.
 */
export class GlobalRelationclassObject {
  relationClassUUID: UUID[];
  relationClassNames: string[];
  relationClassGeometry: string[];
  selectedRelationClass: string;
  relationclassInstanceInCreation!: RelationclassInstance;

  private globalObjectInstance = globalObject;
  private logger = logger;

  constructor() {
    this.relationClassNames = [];
    this.relationClassGeometry = [];
    this.selectedRelationClass = "";
    this.relationClassUUID = [];
  }

  initRelationClasses() {
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    const tabContextClasses = tabContext["sceneType"].relationclasses;
    //for each class
    for (const element of tabContextClasses) {
      this.relationClassNames.push(element.name);
      this.relationClassGeometry.push(JSON.stringify(element.geometry));
      this.relationClassUUID.push(element.uuid);
    }
  }

  onObjectChange() {
    // push to log file
    this.logger.log(`The selected relationClass object has changed to ${this.getSelectedRelationClass()}`, "info");
  }

  getSelectedRelationClass() {
    return this.selectedRelationClass;
  }

  setSelectedRelationClassByUUID(theUUID: string) {
    const index = this.relationClassUUID.findIndex((uuid) => uuid === theUUID);
    this.selectedRelationClass = this.relationClassNames[index];
    this.onObjectChange();
  }

  //get selected relationclass uuid
  getSelectedRelationClassUUID() {
    const index = this.relationClassNames.findIndex((name) => name === this.selectedRelationClass);
    return this.relationClassUUID[index];
  }
}

// Module singleton — one shared instance.
export const globalRelationclassObject = new GlobalRelationclassObject();
