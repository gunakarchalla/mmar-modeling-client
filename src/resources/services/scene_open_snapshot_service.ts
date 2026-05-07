import { singleton, EventAggregator } from 'aurelia';
import { GlobalDefinition } from 'resources/global_definitions';
import { SceneType, SceneInstance } from '../../../../mmar-global-data-structure';

type SceneOpenStateSnapshot = {
    selectedTab: number;
    tabContext: {
        sceneType: SceneType;
        sceneInstance: SceneInstance;
        threeScene: any;
        contextDragObjects: any[];
    }[];
    scene: any;
    dragObjects: any[];
    attributeInstances: any[];
    roleInstances: any[];
    relationObjects: any[];
    currentClassInstance: any;
    currentPortInstance: any;
    currentMetaPort: any;
};

@singleton()
export class SceneOpenSnapshotService {
    private snapshot: SceneOpenStateSnapshot | null = null;

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private eventAggregator: EventAggregator
    ) {}

    createSnapshot() {
        this.snapshot = {
            selectedTab: this.globalObjectInstance.selectedTab,
            tabContext: [...this.globalObjectInstance.tabContext],
            scene: this.globalObjectInstance.scene,
            dragObjects: [...this.globalObjectInstance.dragObjects],
            attributeInstances: [...this.globalObjectInstance.attribute_instances],
            roleInstances: [...this.globalObjectInstance.role_instances],
            relationObjects: [...this.globalObjectInstance.relationObjects],
            currentClassInstance: this.globalObjectInstance.current_class_instance,
            currentPortInstance: this.globalObjectInstance.current_port_instance,
            currentMetaPort: this.globalObjectInstance.current_meta_port
        };
    }

    clearSnapshot() {
        this.snapshot = null;
    }

    rollback() {
        if (!this.snapshot) {
            return;
        }

        this.globalObjectInstance.selectedTab = this.snapshot.selectedTab;
        this.globalObjectInstance.tabContext = this.snapshot.tabContext;
        this.globalObjectInstance.scene = this.snapshot.scene;
        this.globalObjectInstance.dragObjects = this.snapshot.dragObjects;
        this.globalObjectInstance.attribute_instances = this.snapshot.attributeInstances;
        this.globalObjectInstance.role_instances = this.snapshot.roleInstances;
        this.globalObjectInstance.relationObjects = this.snapshot.relationObjects;
        this.globalObjectInstance.current_class_instance = this.snapshot.currentClassInstance;
        this.globalObjectInstance.current_port_instance = this.snapshot.currentPortInstance;
        this.globalObjectInstance.current_meta_port = this.snapshot.currentMetaPort;

        this.eventAggregator.publish('tabChanged');

        this.snapshot = null;
    }
}
