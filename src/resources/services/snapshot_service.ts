import { singleton, EventAggregator } from 'aurelia';
import { plainToInstance } from 'class-transformer';
import { GlobalDefinition } from 'resources/global_definitions';
import { SceneType, SceneInstance } from '../../../../mmar-global-data-structure';

type SceneOpenStateSnapshot = {
    selectedTab: number;
    tabContext: {
        sceneType: SceneType;
        sceneInstance: SceneInstance;
        threeScene: any;
        contextDragObjects: any[];
        isShared: boolean;
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
export class SnapshotService {
    private sceneOpenSnapshot: SceneOpenStateSnapshot | null = null;
    private sceneInstanceSnapshots = new Map<string, SceneInstance>();

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private eventAggregator: EventAggregator
    ) { }

    // --- Scene-open state snapshot ---

    createSceneOpenSnapshot() {
        this.sceneOpenSnapshot = {
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

    clearSceneOpenSnapshot() {
        this.sceneOpenSnapshot = null;
    }

    rollbackSceneOpen() {
        if (!this.sceneOpenSnapshot) {
            return;
        }

        this.globalObjectInstance.selectedTab = this.sceneOpenSnapshot.selectedTab;
        this.globalObjectInstance.tabContext = this.sceneOpenSnapshot.tabContext;
        this.globalObjectInstance.scene = this.sceneOpenSnapshot.scene;
        this.globalObjectInstance.dragObjects = this.sceneOpenSnapshot.dragObjects;
        this.globalObjectInstance.attribute_instances = this.sceneOpenSnapshot.attributeInstances;
        this.globalObjectInstance.role_instances = this.sceneOpenSnapshot.roleInstances;
        this.globalObjectInstance.relationObjects = this.sceneOpenSnapshot.relationObjects;
        this.globalObjectInstance.current_class_instance = this.sceneOpenSnapshot.currentClassInstance;
        this.globalObjectInstance.current_port_instance = this.sceneOpenSnapshot.currentPortInstance;
        this.globalObjectInstance.current_meta_port = this.sceneOpenSnapshot.currentMetaPort;

        this.eventAggregator.publish('tabChanged');

        this.sceneOpenSnapshot = null;
    }

    // --- SceneInstance snapshots ---

    setSceneInstanceSnapshot(sceneInstance: SceneInstance) {
        this.sceneInstanceSnapshots.set(sceneInstance.uuid, this.deepCloneSceneInstance(sceneInstance));
    }

    restoreSceneInstanceToCurrentTab(): SceneInstance | null {
        const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
        if (!tabContext?.sceneInstance) {
            return null;
        }

        const snapshot = this.sceneInstanceSnapshots.get(tabContext.sceneInstance.uuid);
        if (!snapshot) {
            return null;
        }

        // Remove all 3D objects from the Three.js scene and clear tracking arrays
        // so the canvas reflects the restored state after importInstances() re-draws it.
        const threeScene = tabContext.threeScene;
        if (threeScene) {
            for (const obj of tabContext.contextDragObjects) {
                threeScene.remove(obj);
            }
        }
        tabContext.contextDragObjects.length = 0;
        this.globalObjectInstance.attribute_instances.length = 0;
        this.globalObjectInstance.role_instances.length = 0;
        this.globalObjectInstance.relationObjects.length = 0;

        tabContext.sceneInstance = this.deepCloneSceneInstance(snapshot);
        return tabContext.sceneInstance;
    }

    private deepCloneSceneInstance(sceneInstance: SceneInstance): SceneInstance {
        const plain: object = JSON.parse(JSON.stringify(sceneInstance));
        return plainToInstance(SceneInstance, plain);
    }
}
