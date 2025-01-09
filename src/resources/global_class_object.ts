import { singleton } from 'aurelia';
import { UUID } from '../../../mmar-global-data-structure';
import { GlobalDefinition } from './global_definitions';
import { Logger } from './services/logger';

@singleton()
export class GlobalClassObject {

  classUUID: UUID[];
  classNames: string[];
  classGeometry: string[];
  private selectedClass: string;
  private selectedClassUUID: UUID;

  constructor(
    private globalObjectInstance: GlobalDefinition,
    private logger: Logger
  ) {
      this.classNames = [];
      this.classGeometry = [];
      this.selectedClass = '';
      this.selectedClassUUID = '';
      this.classUUID = [];
  }


  initClasses() {
    let tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    let tabContextClasses = tabContext['sceneType'].classes;
    //for each class
    for (const element of tabContextClasses) {
      const id = element.uuid;

      this.classNames.push(element.name);
      this.classGeometry.push(JSON.stringify(element.geometry));
      this.classUUID.push(element.uuid);

    };
  }

  onObjectChange() {
    // push to log file
      this.logger.log(`The selected object has changed to ${this.getSelectedClass()}`, 'info');
  }
  getSelectedClass() {
    return this.selectedClass;
  }
  getSelectedClassUUID() {
    return this.selectedClassUUID;
  }
  setSelectedClass(index) {
    this.selectedClass = this.classNames[index];
    this.selectedClassUUID = this.classUUID[index];
    this.onObjectChange();
  }
  setSelectedClassByUUID(theUUID: string) {
    const index = this.classUUID.findIndex(uuid => uuid === theUUID);
    this.selectedClass = this.classNames[index];
    this.selectedClassUUID = this.classUUID[index];
    this.onObjectChange();
  }

  getIcon(wholeVizRep: string) {
    let vizRep: string = wholeVizRep;
    let map = '';

    //if icon defined
    vizRep = wholeVizRep.split("let icon")[1];
    if (vizRep) {
      const arrStr: string[] = vizRep.split("'");
      for (const substring of arrStr) {
        const string: string = substring;
        if (string.startsWith('data')) {
          map = string;
        }
      };
    }

    //if icon not defined try to take map
    if (map == '') {
      vizRep = wholeVizRep.split("let map")[1];
      if (vizRep) {
        const arrStr: string[] = vizRep.split("'");
        for (const substring of arrStr) {
          const string: string = substring;
          if (string.startsWith('data')) {
            map = string;
          }
        };
      }
    }

    return map;
  }
}
