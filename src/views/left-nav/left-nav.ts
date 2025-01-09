import { GlobalDefinition } from "resources/global_definitions";
import { EventAggregator } from "aurelia";

export class LeftNav{

    public scenesLoadingBar = true;
    public openTab = false;

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private eventAggregator: EventAggregator

    ){
        this.eventAggregator.subscribe('tabChanged', this.checkIfOpenTab.bind(this));
    }

    async checkIfOpenTab(){
        this.openTab = this.globalObjectInstance.selectedTab >= 0 ? true : false;
    }
}