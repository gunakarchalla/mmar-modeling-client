import { HybridAlgorithmsService } from './../../resources/services/hybrid_algorithms_service';
import { MetaUtility } from './../../resources/services/meta_utility';
import { InstanceUtility } from 'resources/services/instance_utility';
import { PersistencyHandler } from 'resources/persistency_handler';

import { SceneType, SceneInstance } from '../../../../mmar-global-data-structure';
import { MdcTreeView } from '@aurelia-mdc-web/tree-view';
import { GlobalDefinition } from '../../resources/global_definitions';
import { FetchHelper } from "../../resources/services/fetchHelper";
import { GlobalClassObject } from "resources/global_class_object";
import { GlobalRelationclassObject } from "resources/global_relationclass_object";
import { SceneInitiator } from 'resources/scene_initiator';
import { EventAggregator, bindable } from 'aurelia';
import { Logger } from 'resources/services/logger';
import { DialogHelper } from 'resources/dialog_helper';

export class Scenegroup {
    private treeView: MdcTreeView;
    // used in html
    private scenesLoadingBar = true;
    private sceneTypes: SceneType[] = [];
    private sceneInstances: SceneInstance[] = [];
    private tree = [];
    // used in html
    private finalTree = [];
    private clickCounter = 0;
    @bindable openSceneGroup = false;
    @bindable dialogCreateNewScene = null;
    @bindable dialogLoadingWindow = null;


    constructor(
        private fetchHelper: FetchHelper,
        private globalObjectInstance: GlobalDefinition,
        private globalClassObject: GlobalClassObject,
        private globalRelationclassObject: GlobalRelationclassObject,
        private persistencyHandler: PersistencyHandler,
        private instanceUtility: InstanceUtility,
        private sceneInitiator: SceneInitiator,
        private eventAggregator: EventAggregator,
        private metaUtility: MetaUtility,
        private logger: Logger,
        private hybridAlgorithmsService: HybridAlgorithmsService,
        private dialogHelper: DialogHelper
    ) {
        // subscribe to updateSceneGroup event that is emitted, e.g. when a new scdneType or SceneInstance file is imported
        this.eventAggregator.subscribe('updateSceneGroup', this.updateTree.bind(this));
    }

    async attached() {

        //init eventAggregator to listen if the user is loged in
        this.eventAggregator.subscribe('login', await this.whenLoggedIn.bind(this));
    }

    // Function to be called when the user is logged in to init the tree
    async whenLoggedIn() {
        //init the scene group tree
        await this.initTree();
        this.finalTree = this.tree;
        this.scenesLoadingBar = false;
        this.dialogLoadingWindow.close();
    }

    // Function to initialize the tree
    async initTree() {
        // set the scenesLoadingBar to true, so that the loading bar will be displayed
        this.scenesLoadingBar = true;

        // open dialogLoadingWindow
        this.dialogHelper.openDialog(this.dialogLoadingWindow, 'openDialogLoadingWindow', {});

        await this.metaUtility.getAllUUIDs();
        await this.metaUtility.getAllFiles();

        // fetch all sceneTypes from the database
        await this.metaUtility.getAllSceneTypesFromDB().then(async (sceneTypes) => {
            // assign the fetched sceneTypes to the sceneTypes array
            this.sceneTypes = sceneTypes;
            // add empty children array to sceneTypes
            for (const sceneType of this.sceneTypes) {
                sceneType["children"] = [];
            }
            // assign the sceneTypes array to the tree
            this.tree = this.sceneTypes;
            // assign the sceneTypes array to the globalObjectInstance
            this.globalObjectInstance.sceneTypes = this.sceneTypes;


            // for each sceneType in the sceneTypes array
            for (const sceneType of this.sceneTypes) {
                // fetch all sceneInstances for that sceneType from the database
                await this.fetchHelper.sceneInstancesAllGET(sceneType.uuid).then((data) => {
                    // for each sceneInstance in the sceneInstances array
                    for (const sceneInstance of data) {
                        // push the sceneInstance to the sceneInstances array
                        this.sceneInstances.push(sceneInstance);
                        // get the index of the sceneType in the tree
                        const index = this.tree.findIndex((item) => item.uuid === sceneType.uuid);
                        // if the sceneType does not have any children
                        if (this.tree[index].children === undefined) {
                            // create a children array for the sceneType
                            this.tree[index].children = [];
                        }
                        // push the sceneInstance to the sceneType's children array
                        this.tree[index].children.push(sceneInstance);
                    }
                });
                await this.updateTree();
            }
        });

        // assign the tree to the finalTree
        this.finalTree = this.tree;
        this.globalObjectInstance.sceneTree = this.tree;

        // set the scenesLoadingBar to false, so that the loading bar will be hidden
        this.scenesLoadingBar = false;
        this.openSceneGroup = true;
    }

    async updateTree() {
        const importSceneInstances = this.globalObjectInstance.importSceneInstances;

        // check for every sceneType
        for (const sceneType of this.sceneTypes) {

            // search in importSceneInstances for sceneInstances with the same uuid_scene_type
            // these sceneInstances are coming from the text import and are not yet in the tree
            for (const importSceneInstance of importSceneInstances) {
                if (importSceneInstance.uuid_scene_type === sceneType.uuid) {
                    this.sceneInstances.push(importSceneInstance);
                    const index = this.tree.findIndex((item) => item.uuid === sceneType.uuid);
                    if (index === -1) {
                        this.logger.log(`SceneType with uuid ${sceneType.uuid} not found in tree`, "info");
                        continue;
                    }
                    if (this.tree[index].children === undefined) {
                        this.tree[index].children = [];
                    }
                    //search in tree for sceneType with same uuid
                    const index2 = this.tree[index].children.findIndex((item) => item.uuid === importSceneInstance.uuid);
                    if (index2 !== -1) {
                        this.logger.log(`SceneInstance with uuid ${importSceneInstance.uuid} already exists in tree`, "info");
                    } else {
                        this.tree[index].children.push(importSceneInstance);
                    }
                }
            }

            // search in open sceneInstances for sceneInstances with the same uuid_scene_type
            // these sceneInstances are coming from open tabs. They are not yet stored in the database and thus not in the default tree
            const tabContext = this.globalObjectInstance.tabContext;
            for (const context of tabContext) {
                if (context.sceneInstance && context.sceneInstance.uuid_scene_type === sceneType.uuid) {
                    //push to sceneInstances if not already in there
                    const instance = this.sceneInstances.find((item) => item.uuid === context.sceneInstance.uuid);
                    if (instance === undefined) {
                        this.sceneInstances.push(context.sceneInstance);
                    }

                    const index = this.tree.findIndex((item) => item.uuid === sceneType.uuid);
                    if (index === -1) {
                        this.logger.log(`SceneType with uuid ${sceneType.uuid} not found in tree`, "info");
                        continue;
                    }
                    else {
                        if (this.tree[index].children === undefined) {
                            this.tree[index].children = [];
                        }
                        const sceneInstace = this.tree[index].children.find((item) => item.uuid === context.sceneInstance.uuid);
                        if (sceneInstace === undefined) {
                            this.tree[index].children.push(context.sceneInstance);
                        }
                    }
                }
            }
        }

        this.globalObjectInstance.importSceneInstances = [];
        this.finalTree = [];
        this.finalTree = this.tree;
        //set tree
        this.globalObjectInstance.sceneTree = this.tree;
        // disable loading bar
        this.scenesLoadingBar = false;
        this

    }

    async openScene() {
        if (this.metaUtility.checkIfSceneType(this.treeView.selectedNode)) {
            // open dialog for new scene instance
            const sceneType = this.treeView.selectedNode as SceneType;
            this.dialogHelper.openDialog(this.dialogCreateNewScene, 'openCreateNewSceneInstanceDialog', { sceneType: sceneType });
        }
        else if (this.instanceUtility.checkIfSceneInstance(this.treeView.selectedNode)) {
            const sceneInstance = this.treeView.selectedNode as SceneInstance;
            await this.sceneInitiator.sceneInit();
            await this.instanceUtility.createTabContextSceneInstance(sceneInstance);
            await this.persistencyHandler.loadPersistedModel(sceneInstance);
            // set globalClassObject classes
            this.globalClassObject.initClasses()
            this.globalRelationclassObject.initRelationClasses();

            //check hybrid algorithms -> specifically for reference attributes --> we do not give an attributeInstance as argument
            const classInstances = sceneInstance.class_instances;
            await this.hybridAlgorithmsService.checkHybridAlgorithms(null, classInstances);
        }
    }

    // check for double click to open scene
    async clickChecker() {
        await this.createHelperText();
        this.clickCounter++;
        if (this.clickCounter === 2) {
            this.clickCounter = 0;
            this.openScene();
        }
        setTimeout(() => {
            this.clickCounter = 0;
        }
            , 500);
    }


    async createHelperText() {
        //for each node remove helperText
        this.removeHelperText();
        //for each node in treeView check if node is clicked
        if (this.treeView.selectedNode.children === undefined) {
            this.treeView.selectedNode["helperText"] = " DC to open";
        } else {
            this.treeView.selectedNode["helperText"] = " DC for new";
        }
    }

    async removeHelperText() {
        //for each node in treeView remove helperText
        for (const node of this.treeView.nodes) {
            node["helperText"] = "";
            for (const child of node.children) {
                child["helperText"] = "";
            }
        }
    }
}



