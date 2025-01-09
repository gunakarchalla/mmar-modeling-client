import { singleton } from 'aurelia';
import { RelationclassInstance, UUID } from '../../../mmar-global-data-structure';
import { GlobalDefinition } from './global_definitions';
import { Logger } from './services/logger';

@singleton()
export class GlobalRelationclassObject {

  relationClassUUID: UUID[];
  relationClassNames: string[];
  relationClassGeometry: string[];
  selectedRelationClass: string;
  relationclassInstanceInCreation: RelationclassInstance;

  constructor(
    private globalObjectInstance: GlobalDefinition,
    private logger: Logger
  ) {
    this.relationClassNames = [];
    this.relationClassGeometry = [];
    this.selectedRelationClass = "";
    this.relationClassUUID = [];
    
  }

  initRelationClasses() {
    let tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    let tabContextClasses = tabContext['sceneType'].relationclasses;
    //for each class
    for (const element of tabContextClasses) {
      const id = element.uuid;

      this.relationClassNames.push(element.name);
      this.relationClassGeometry.push(JSON.stringify(element.geometry));
      this.relationClassUUID.push(element.uuid);

    };
  }


  onObjectChange() {
    // push to log file
      this.logger.log(`The selected relationClass object has changed to ${this.getSelectedRelationClass()}`, 'info');
  }

  getSelectedRelationClass() {
    return this.selectedRelationClass;
  }

  setSelectedObject(index: number) {
    this.selectedRelationClass = JSON.parse(this.relationClassNames[index]);
    this.onObjectChange();
  }
  setSelectedRelationClassByUUID(theUUID: string) {
    const index = this.relationClassUUID.findIndex(uuid => uuid === theUUID);
    this.selectedRelationClass = this.relationClassNames[index];
    const dropdown = document.getElementById("class_dropdown") as HTMLSelectElement;
    // dropdown.value = this.getSelectedRelationClass();
    // const changeEvent = new Event("change");
    // dropdown.dispatchEvent(changeEvent);
    this.onObjectChange();
  }

  //get selected relationclass uuid
  getSelectedRelationClassUUID() {
    const index = this.relationClassNames.findIndex(name => name === this.selectedRelationClass);
    return this.relationClassUUID[index];
  }
}
