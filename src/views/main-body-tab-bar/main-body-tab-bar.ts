import { EventAggregator } from 'aurelia';
import { GlobalSelectedObject } from './../../resources/global_selected_object';
import { SceneInitiator } from 'resources/scene_initiator';
import { GlobalRelationclassObject } from './../../resources/global_relationclass_object';
import { GlobalClassObject } from "resources/global_class_object";
import { GlobalDefinition } from "../../resources/global_definitions";
import { InstanceUtility } from 'resources/services/instance_utility';
import { SceneType, SceneInstance } from '../../../../mmar-global-data-structure';
import * as THREE from 'three';
import { Logger } from 'resources/services/logger';

export class MainBodyTabBar {

  selectedTab = 0; // Set the default active tab
  open = false;
  //selectedTabContext: {} = {};

  constructor(
    private globalObjectInstance: GlobalDefinition,
    private globalClassObject: GlobalClassObject,
    private globalRelationclassObject: GlobalRelationclassObject,
    private instanceUtility: InstanceUtility,
    private sceneInitiator: SceneInitiator,
    private globalSelectedObject: GlobalSelectedObject,
    private logger: Logger,
    private eventAggregator: EventAggregator
  ) { }



  // This function is called when a tab is clicked
  // It sets the selectedTab variable to the clicked tab
  // This variable is used to set the active class on the tab
  async clickedTab(selectedTab: number) {

    //remove boxHelper if it exists on old active scene
    this.globalSelectedObject.removeObject();

    this.selectedTab = selectedTab;

    // Set the selected tab context
    this.globalObjectInstance.selectedTab = this.selectedTab;
    this.eventAggregator.publish('tabChanged');

    const threeScene = await this.instanceUtility.getTabContextThreeInstance();

    if (threeScene) {
      this.globalObjectInstance.scene = threeScene;

      this.logger.log('Current Tab ' + this.selectedTab + ": name: " + this.globalObjectInstance.tabContext[selectedTab].sceneInstance.name, 'info');

      // set globalClassObject classes
      this.globalClassObject.initClasses()
      this.globalRelationclassObject.initRelationClasses();

      this.globalObjectInstance.dragObjects = this.globalObjectInstance.tabContext[this.selectedTab].contextDragObjects;
      //-------------------------------
      //set up controls
      //-------------------------------
      this.globalObjectInstance.scene.add(this.globalObjectInstance.mousePointer3d);

      //add transformcontrols to scene
      this.sceneInitiator.initTransformControls();

      this.globalObjectInstance.scene.add(this.globalObjectInstance.plane);

    }

  }

  closeTab(tab: { sceneType: SceneType; sceneInstance: SceneInstance; threeScene: THREE.Scene; contextDragObjects: THREE.Mesh[]; }) {

    // find index of tab
    const index = this.globalObjectInstance.tabContext.indexOf(tab);
    
    if (index > 0 || (index == 0 && this.globalObjectInstance.tabContext.length > 1)) {
      // remove tab from tabContext
      this.globalObjectInstance.tabContext.splice(index, 1);
      // set selectedTab to index -1
      if(index == 0){
        this.clickedTab(index)
      }
      else{
        this.clickedTab(index - 1);
      }
      this.logger.log('close tab', 'info');
      return;
    }
    if (index == 0 && this.globalObjectInstance.tabContext.length == 1) {
      this.globalObjectInstance.tabContext = [];
      this.globalObjectInstance.scene = new THREE.Scene();
      this.globalObjectInstance.selectedTab = -1;
      this.eventAggregator.publish('tabChanged');
      this.globalObjectInstance.dragObjects = [];
    }
  }
}