import { GlobalClassObject } from '../../resources/global_class_object';
import { Class, ClassInstance } from '../../../../mmar-global-data-structure';
import { GlobalStateObject } from 'resources/global_state_object';
import { GlobalDefinition } from 'resources/global_definitions';
import { bindable, EventAggregator } from 'aurelia';

export class ClassButtongroup {

    @bindable openTab = null;

    constructor(
        private globalClassObject: GlobalClassObject,
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
        //set selected class to globalClassObject
        this.globalClassObject.setSelectedClassByUUID(uuid);
        this.globalStateObject.setState(2);

    }

    async getImage(metaclass: Class) {
        const geometry = metaclass.geometry;
        const icon = await this.globalClassObject.getIcon(geometry.toString());
        return icon;
    }

    async setIcons() {
        //call getImage on all Classes of globalObjectInstance.tabContext[globalObjectInstance.selectedTab].sceneType.classes
        const classes = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab].sceneType.classes;
        for (const metaclass of classes) {
            metaclass["icon"] = undefined;
            const icon = await this.getImage(metaclass);
            metaclass["icon"] = icon;
        }
    }
}