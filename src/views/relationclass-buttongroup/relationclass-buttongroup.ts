import { GlobalClassObject } from './../../resources/global_class_object';
import { RelationclassInstance } from "../../../../mmar-global-data-structure";
import { GlobalRelationclassObject } from 'resources/global_relationclass_object';
import { GlobalStateObject } from 'resources/global_state_object';
import { GlobalDefinition } from 'resources/global_definitions';
import { bindable } from 'aurelia';

export class RelationclassButtongroup {

    @bindable openTab = null;

    constructor(
        private globalClassObject: GlobalClassObject,
        private globalRelationclassObject: GlobalRelationclassObject,
        private globalStateObject: GlobalStateObject,
        //do not delete -> needed for the html 
        private globalObjectInstance: GlobalDefinition
    ) {
    }

    onButtonClicked(uuid: string) {
        this.globalRelationclassObject.setSelectedRelationClassByUUID(uuid);

        this.globalStateObject.setState(3);
    }

    getImage(classInstance: RelationclassInstance) {
        const geometry = classInstance.geometry;
        const icon = this.globalClassObject.getIcon(geometry.toString());
        return icon;
    }
}