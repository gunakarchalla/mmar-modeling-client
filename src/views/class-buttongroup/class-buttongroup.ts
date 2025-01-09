import { GlobalClassObject } from '../../resources/global_class_object';
import { ClassInstance } from '../../../../mmar-global-data-structure';
import { GlobalStateObject } from 'resources/global_state_object';
import { GlobalDefinition } from 'resources/global_definitions';
import { bindable } from 'aurelia';

export class ClassButtongroup {

    @bindable openTab = null;
    
    constructor(
        private globalClassObject: GlobalClassObject,
        private globalStateObject: GlobalStateObject,
        //do not delete -> needed for the html 
        private globalObjectInstance: GlobalDefinition
    ) {
    }

    onButtonClicked(uuid: string) {
        //set selected class to globalClassObject
        this.globalClassObject.setSelectedClassByUUID(uuid);
        this.globalStateObject.setState(2);

    }

    getImage(classInstance: ClassInstance) {
        const geometry = classInstance.geometry;
        const icon = this.globalClassObject.getIcon(geometry.toString());
        return icon;
    }
}