import { GlobalClassObject } from './../../resources/global_class_object';
import { Relationclass, RelationclassInstance } from "../../../../mmar-global-data-structure";
import { GlobalRelationclassObject } from 'resources/global_relationclass_object';
import { GlobalStateObject } from 'resources/global_state_object';
import { GlobalDefinition } from 'resources/global_definitions';
import { bindable, EventAggregator } from 'aurelia';

export class RelationclassButtongroup {

    @bindable openTab = null;

    constructor(
        private globalClassObject: GlobalClassObject,
        private globalRelationclassObject: GlobalRelationclassObject,
        private globalStateObject: GlobalStateObject,
        //do not delete -> needed for the html 
        private globalObjectInstance: GlobalDefinition,
        private eventAggregator: EventAggregator
    ) {
        this.eventAggregator.subscribe('tabChanged', async () => {
            await this.setIcons();
        });
    }

    async attached() {
        await this.setIcons();
    }

    onButtonClicked(uuid: string) {
        this.globalRelationclassObject.setSelectedRelationClassByUUID(uuid);

        this.globalStateObject.setState(3);
    }

    async getImage(metaclass: Relationclass) {
        const geometry = metaclass.geometry;
        const icon = await this.globalClassObject.getIcon(geometry.toString());
        return icon;
    }

    async setIcons() {
        //call getImage on all Classes of globalObjectInstance.tabContext[globalObjectInstance.selectedTab].sceneType.classes
        const relationclasses = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab].sceneType.relationclasses;
        for (const metaclass of relationclasses) {
            metaclass["icon"] = undefined;
            const icon = await this.getImage(metaclass);
            metaclass["icon"] = icon;
        }
    }
}