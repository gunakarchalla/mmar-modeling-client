import { HybridAlgorithmsService } from './../../resources/services/hybrid_algorithms_service';
import { MetaUtility } from './../../resources/services/meta_utility';
import { GlobalSelectedObject } from './../../resources/global_selected_object';
import { EventAggregator, bindable } from "aurelia";
import { ClassInstance, PortInstance, RelationclassInstance, AttributeInstance, SceneInstance, AttributeType, Attribute } from "../../../../mmar-global-data-structure";
import { GlobalDefinition } from 'resources/global_definitions';
import { InstanceUtility } from 'resources/services/instance_utility';
import { Logger } from 'resources/services/logger';
import { VizrepUpdateChecker } from 'resources/services/vizrep_update_checker';
import { GraphicContext } from 'resources/graphic_context';
import { validate as uuidValidate } from 'uuid';
import { FetchHelper } from 'resources/services/fetchHelper';
import { FileUtility } from 'resources/services/file_utility';
import { SharedDocService } from 'resources/collaboration/shared_doc_service';
import { applyLocalChangeToYDoc } from 'resources/collaboration/y_mapping';

export class AttributeWindow {

  currentClassInstance: ClassInstance = null;
  currentPortInstance: PortInstance = null;
  currentRelationclassInstance: RelationclassInstance = null;
  attributeInstances: AttributeInstance[] = [];
  attributeInstancesUuidsOfFileType: string[] = [];

  attributeInstancesNoTable: AttributeInstance[] = [];
  //store attribute types for attributeInstancesNoTable array
  attributeTypesForNoTableAttributeInstances: AttributeType[] = [];

  attributeInstanceTable: AttributeInstance[] = [];
  //store attribute types for attributeInstanceTable array
  attributeTypesForTableAttributeInstances: AttributeType[] = [];

  attributeInstancesReferenceAttribute: AttributeInstance[] = [];

  //store attribute types for attributeInstancesReferenceAttribute array
  attributeTypesForReferenceAttributeInstances: AttributeType[] = [];

  oldAttributeValues: { uuid: string, value: unknown }[] = [];
  visible = false;

  //boolean for checking dialog level
  @bindable firstLevel = true;

  constructor(
    private eventAggregator: EventAggregator,
    private globalSelectedObject: GlobalSelectedObject,
    private globalObjectInstance: GlobalDefinition,
    private instanceUtility: InstanceUtility,
    private logger: Logger,
    private metaUtility: MetaUtility,
    private hybridAlgorithmsService: HybridAlgorithmsService,
    private vizrepUpdateChecker: VizrepUpdateChecker,
    private gc: GraphicContext,
    private fetchHelper: FetchHelper,
    private fileUtility: FileUtility,
    private sharedDocService: SharedDocService
  ) {
  }

  get isReadOnly(): boolean {
    return this.globalObjectInstance.currentTabAccess === 'read';
  }

  async attached() {
    this.eventAggregator.subscribe('updateAttributeGui', this.updater.bind(this));
    this.eventAggregator.subscribe('removeAttributeGui', await this.delayedReset.bind(this));
    this.eventAggregator.subscribe('gltfUploaded', async payload => { await this.gltfUploaded(payload) });
    this.eventAggregator.subscribe('imageUploaded', async payload => { await this.imageUploaded(payload) });
    let buttons = document.querySelectorAll("mdc-button");
    buttons.forEach(button => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
      });
    });
  }

  async deleteFile(attributeInstance: AttributeInstance) {
    if (this.isUUID(attributeInstance.value)) {
      await this.fetchHelper.deleteFileByUUID(attributeInstance.value);
      this.metaUtility.deleteFileByUUID(attributeInstance.value);
      const metaAttribute: Attribute = await this.metaUtility.getMetaAttribute(attributeInstance.uuid_attribute);
      attributeInstance.value = metaAttribute.default_value;
    }
  }

  async downloadFile(attributeInstance: AttributeInstance) {
    if (this.isUUID(attributeInstance.value)) {
      let file = this.metaUtility.getFileByUUID(attributeInstance.value);

      // If file is not in local cache, fetch it from server
      if (!file) {
        try {
          file = await this.fetchHelper.getFileByUUID(attributeInstance.value);
          // Store it in local cache for future use
          this.metaUtility.setFile(attributeInstance.value, file);
        } catch (error) {
          this.logger.log(`Failed to download file: ${error}`, 'error');
          return;
        }
      }

      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  async gltfUploaded(message) {
    this.hybridAlgorithmsService.checkHybridAlgorithms(message);
  }

  async imageUploaded(message) {
    this.hybridAlgorithmsService.checkHybridAlgorithms(message);
  }

  //get all attribute instances of type file
  async getAttributeInstancesOfFileType() {
    for (const attributeInstance of this.attributeInstances) {
      // looping through all attribute instances and checking if the attribute type is file through uuid of File Attribute Type
      const metaAttribute: Attribute = await this.metaUtility.getMetaAttribute(attributeInstance.uuid_attribute);
      if (metaAttribute.attribute_type.uuid == "2df15b5e-6b43-4911-b38b-0fc5747a8ee6") {

        // if the attribute instance is not already in the array, push it
        if (!this.attributeInstancesUuidsOfFileType.includes(attributeInstance.uuid)) {
          this.attributeInstancesUuidsOfFileType.push(attributeInstance.uuid);
        }
      }
    }
  }

  isUUID(value: string): boolean {
    return uuidValidate(value);
  }

  async updater() {
    await this.reset();

    //if there is a selected object
    const selectedObject = this.globalSelectedObject.getObject();
    if (selectedObject) {
      //get classInstance and its AttributeInstances
      const sceneInstance: SceneInstance = await this.instanceUtility.getTabContextSceneInstance();
      this.currentClassInstance = sceneInstance.class_instances.find(class_instance => class_instance.uuid == this.globalSelectedObject.getObject().uuid);
      const portInstances = await this.instanceUtility.getAllPortInstancesOfTabContext();
      this.currentPortInstance = portInstances.find(port_instance => port_instance.uuid == this.globalSelectedObject.getObject().uuid);
      this.currentRelationclassInstance = sceneInstance.relationclasses_instances.find(relationclass_instance => relationclass_instance.uuid == this.globalSelectedObject.getObject().uuid);

      //if there is a classInstance
      if (this.currentClassInstance) {
        this.attributeInstances = this.currentClassInstance.attribute_instance;
      }
      //if there is a portInstance
      else if (this.currentPortInstance) {
        this.attributeInstances = this.currentPortInstance.attribute_instances;
      }
      //if there is a relationclassInstance
      else if (this.currentRelationclassInstance) {
        this.attributeInstances = this.currentRelationclassInstance.attribute_instance;
      }

      //for sorting after sequence number
      const enhancedAttributeInstanceArray = [];
      for (const attributeInstance of this.attributeInstances) {
        //get the uuid to which the attribute belongs to
        let uuidParent = attributeInstance.assigned_uuid_class_instance;
        if (!uuidParent) {
          uuidParent = attributeInstance.assigned_uuid_port_instance;
        }
        if (!uuidParent) {
          uuidParent = attributeInstance.assigned_uuid_scene_instance;
        }

        let metaAttribute: Attribute

        //get instance concept of uuidParent
        if (uuidParent) {
          const classInstance = await this.instanceUtility.getClassInstance(uuidParent);
          const portInstance = await this.instanceUtility.getPortInstance(uuidParent);
          const sceneInstance = await this.instanceUtility.getSceneInstance(uuidParent);
          if (classInstance) {
            classInstance ? metaAttribute = await this.metaUtility.getMetaAttributeWithSequence(attributeInstance.uuid_attribute, classInstance.uuid_class) : undefined;
          }
          if (!classInstance) {
            portInstance ? metaAttribute = await this.metaUtility.getMetaAttributeWithSequence(attributeInstance.uuid_attribute, portInstance.uuid_port) : undefined;
          }
          if (!classInstance && !portInstance) {
            sceneInstance ? metaAttribute = await this.metaUtility.getMetaAttributeWithSequence(attributeInstance.uuid_attribute, sceneInstance.uuid_scene_type) : undefined;
          }
        }

        //if sequence is not set in meta attribute, set it to 1000, otherwiseset value
        const sequence = metaAttribute.sequence ?? 1000;
        const uiComponent = metaAttribute.ui_component ?? "text";

        //get enum values from regex if attribute type is enum or boolean
        let facets: string[] = [];
        let facetsString = "";
        if (metaAttribute.attribute_type.regex_value) {
          facetsString = metaAttribute.facets;
        }
        if (facetsString) {
          //split regex at | and pus each value to array
          facets = facetsString.split("|");
        }

        enhancedAttributeInstanceArray.push(
          {
            "attributeInstance": attributeInstance,
            "sequence": sequence,
            "uiType": uiComponent,
            "metaAttribute": metaAttribute,
            "facets": facets
          }
        );
      }

      //sort array after sequence number
      enhancedAttributeInstanceArray.sort((a, b) => a.sequence - b.sequence);
      this.attributeInstances = [];
      for (const sequenceObject of enhancedAttributeInstanceArray) {
        this.attributeInstances.push(sequenceObject.attributeInstance);
      }



      //set current values of each instance to an array --> needed for text mesh update
      for (const attributeInstanceFromArray of enhancedAttributeInstanceArray) {
        //push all old values
        this.oldAttributeValues.push(
          {
            "uuid": attributeInstanceFromArray.attributeInstance.uuid,
            "value": attributeInstanceFromArray.attributeInstance.value
          }
        );

        //get meta attribute of attribute instance
        const metaAttribute: Attribute = await this.metaUtility.getMetaAttribute(attributeInstanceFromArray.attributeInstance.uuid_attribute);
        let attributeType: AttributeType;
        let isReferenceAttribute = false;
        if (metaAttribute) {
          attributeType = metaAttribute.attribute_type;
          //check if attribute is a reference attribute
          //attribute.role is set
          isReferenceAttribute = attributeType.role != null;
        }

        if (isReferenceAttribute) {
          this.attributeInstancesReferenceAttribute.push(attributeInstanceFromArray);
          this.attributeTypesForReferenceAttributeInstances.push(attributeType);
        }
        //push no table attribute instances to array
        else if (attributeInstanceFromArray.attributeInstance.table_attributes.length == 0) {
          this.visible = true;
          this.attributeInstancesNoTable.push(attributeInstanceFromArray);
          this.attributeTypesForNoTableAttributeInstances.push(attributeType);
        }
        //push table attribute table instances to array
        else {
          this.visible = true;
          this.attributeInstanceTable['dialogRef'] = null;
          this.attributeInstanceTable.push(attributeInstanceFromArray);
          this.attributeTypesForTableAttributeInstances.push(attributeType);
        }
      }
    }
    await this.getAttributeInstancesOfFileType();
  }

  async reset() {
    this.currentClassInstance = null;
    this.currentPortInstance = null;
    this.attributeInstances = [];
    this.attributeInstancesNoTable = [];
    this.attributeInstanceTable = [];
    this.attributeInstancesReferenceAttribute = [];
    this.attributeTypesForNoTableAttributeInstances = [];
    this.attributeTypesForTableAttributeInstances = [];
    this.attributeTypesForReferenceAttributeInstances = [];
    this.visible = false;
    this.oldAttributeValues = [];
    this.attributeInstancesUuidsOfFileType = [];
  }

  //reset with delay of 100ms -> needed for text mesh update since we need the context of the old values
  async delayedReset() {
    setTimeout(async () => {
      await this.reset();
    }, 10);
  }


  async fieldChange(attributeInstance: AttributeInstance) {
    const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);

    // Block writes from read-only collaborators or while applying a remote Yjs change
    if (session?.access === 'read') return;
    if (session?.applyingRemote) return;

    //update attribute value
    attributeInstance.value = attributeInstance.value.toString();

    await this.vizrepUpdateChecker.checkForVizRepUpdate(attributeInstance);

    //if this.currentClassInstance is set, we are in a classInstance
    if (this.currentClassInstance) {
      await this.hybridAlgorithmsService.checkHybridAlgorithms(null, [this.currentClassInstance]);
    }
    //if this.currentPortInstance is set, we are in a portInstance
    else if (this.currentPortInstance) {
      await this.hybridAlgorithmsService.checkHybridAlgorithms(null, null, [this.currentPortInstance]);
    }

    if (session) {
      // Shared mode: propagate attribute change through Yjs and mark local dirty flag
      if (this.currentClassInstance) {
        applyLocalChangeToYDoc(
          session.ydoc,
          {
            type: 'attribute_value',
            classInstanceUuid: this.currentClassInstance.uuid,
            attributeUuid: attributeInstance.uuid,
            value: attributeInstance.value
          },
          session.localOrigin
        );
      }
      this.globalObjectInstance.doSceneInstancePatchLocal = true;
    } else {
      this.globalObjectInstance.doSceneInstancePatch = true;
    }

    return Promise.resolve();
  }

  //this function handles the dialog used for reference fields. Since the dialog is used multiple times, it is called here with the right context
  async openDialog(dialog, attributeInstance) {
    console.log("open dialog");
    this.eventAggregator.publish('openReferenceDialog', { attributeInstance: attributeInstance });
    dialog.open(attributeInstance)
  }
}