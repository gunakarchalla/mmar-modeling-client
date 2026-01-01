import { GlobalDefinition } from "resources/global_definitions";
import { InstanceCreationHandler } from "resources/instance_creation_handler";
import { MetaUtility } from "resources/services/meta_utility";
import { AttributeInstance, Attribute, AttributeType, UUID, Class, ClassInstance, PortInstance } from "../../../../mmar-global-data-structure";
import { ColumnStructure } from "../../../../mmar-global-data-structure/models/meta/Metamodel_columns.structure";
import { bindable, valueConverter } from "aurelia";
import { VizrepUpdateChecker } from "resources/services/vizrep_update_checker";
import { MdcDialog } from "@aurelia-mdc-web/dialog";
import { HybridAlgorithmsService } from "resources/services/hybrid_algorithms_service";
import { UrdfPoseService } from "resources/services/urdf_pose_service";

export class DialogTableAttribute {

    @bindable attributeInstance: AttributeInstance = null;
    @bindable currentClassInstance: ClassInstance = null;
    @bindable currentPortInstance: PortInstance = null;
    @bindable attribute: Attribute = null;
    @bindable currentDialog: MdcDialog = null;

    private currentAttribute: Attribute;
    private currentAttributeType: AttributeType;

    private table = [];
    private columns = [];
    private rows = [];

    // Array to hold references to nested dialogs
    private nestedDialogs: any[][] = [];

    private currentClass: Class;

    //all columns of the table
    private has_table_attribute: ColumnStructure[] = [];

    //all cells of the table
    private tableAttributes: AttributeInstance[] = [];

    private facetsAll: string[][] = [];

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private metaUtility: MetaUtility,
        private instanceCreationHandler: InstanceCreationHandler,
        private vizrepUpdateChecker: VizrepUpdateChecker,
        private hybridAlgorithmsService: HybridAlgorithmsService,
        private urdfPoseService: UrdfPoseService,
    ) {

    }


    async attached() {
        await this.reset();
        await this.load();
    }

    async load() {
        await this.reset();
        await this.setMetaInformation();
        await this.setUpTable();
    }

    async reset() {
        this.columns = [];
        this.has_table_attribute = [];
        this.table = [];
        this.rows = [];
        this.nestedDialogs = [];
    }

    async setMetaInformation() {
        const attributeUUID: UUID = this.attributeInstance.uuid_attribute;
        this.currentClass = await this.metaUtility.getMetaClass(this.globalObjectInstance.current_class_instance.uuid_class);
        if (!this.attribute) {
            this.currentAttribute = this.currentClass.attributes.find(attribute => attribute.uuid === attributeUUID);

        } else {
            this.currentAttribute = this.attribute;
        }
        this.currentAttributeType = this.currentAttribute.attribute_type;
    }

    async setUpTable() {
        //get the table cells
        try {
            this.tableAttributes = this.attributeInstance.table_attributes;
        } catch (err) {
            this.tableAttributes = [];
        }
        //if there are no table attributes, there is no table
        if (!this.tableAttributes.length) {
            this.has_table_attribute = [];
            return;
        }
        this.has_table_attribute = this.currentAttributeType.has_table_attribute;

        //for each entry in column structure
        for (let i = 0; i < this.has_table_attribute.length; i++) {
            const rightIndexAttribute = this.has_table_attribute.find(column => column.sequence === i + 1);
            if (rightIndexAttribute) {
                this.columns.push(rightIndexAttribute);
                //push the column name into the table
                this.table.push([rightIndexAttribute]);
            }
        }

        for (let i in this.columns) {
            const column = this.columns[i];

            if (column.ui_component == "dropdown" && column.attribute) {
                this.facetsAll.push(column.attribute.facets.split("|"));

            } else if (column.ui_component == "slider" && column.attribute) {
                this.facetsAll.push(column.attribute.facets.split("|"));

            } else {
                this.facetsAll.push([]);
            }
        }

        let rowCount = 0;
        for (let i = 0; i < this.tableAttributes.length; i += this.columns.length) {
            this.rows.push([]);
            this.nestedDialogs.push([]);

            //for each column
            for (let j = 0; j < this.columns.length; j++) {
                this.rows[rowCount].push(this.tableAttributes[i + j]);
                this.nestedDialogs[rowCount].push(null);
            }
            rowCount++;
        }
    }


    async ok(event?: Event) {
        console.log('ok');
        // Stop the event from propagating to parent dialogs
        if (event) {
            event.stopPropagation();
        }
        // Close only the current dialog if reference exists
        if (this.currentDialog) {
            this.currentDialog.close();
        }
    }

    async close(event?: Event) {
        console.log('close');
        // Stop the event from propagating to parent dialogs
        if (event) {
            event.stopPropagation();
        }
        // Close only the current dialog if reference exists
        if (this.currentDialog) {
            this.currentDialog.close();
        }
    }

    async openNestedDialog(i: number, j: number) {
        if (this.nestedDialogs[i] && this.nestedDialogs[i][j]) {
            this.nestedDialogs[i][j].open();
        }
    }

    async createRow() {
        //Count the number of rows in the table
        let numRows = await this.countRows();

        //Create a new row
        for (const column of this.has_table_attribute) {
            //Create a cell in the new row for each column
            await this.createCell(numRows + 1, column.sequence);
        }

        //Reload the table
        await this.load();
    }

    async countRows() {
        return this.rows.length;
    }

    async createCell(row: number, columnIndex: number) {
        // The column where the cell is created
        let parentAttributeColumn: ColumnStructure = this.has_table_attribute.find((column: ColumnStructure) => column.sequence === columnIndex);

        let metaAttribute = parentAttributeColumn.attribute;
        // Create a new instance of the attribute that is in the column
        let newAttributeInstance: AttributeInstance
        if (metaAttribute.attribute_type.has_table_attribute.length > 0) {
            newAttributeInstance = await this.instanceCreationHandler.createAttributeInstance(
                parentAttributeColumn.attribute,
                null,
                null,
                //get attribute type default value
                "",
                null,
                null,
                null,
                null,
                this.currentAttribute.uuid,
                null
            );
        } else {
            newAttributeInstance = await this.instanceCreationHandler.createAttributeInstance(
                parentAttributeColumn.attribute,
                null,
                null,
                //get attribute type default value
                parentAttributeColumn.attribute.default_value ? parentAttributeColumn.attribute.default_value : "not defined",
                null,
                null,
                null,
                null,
                this.currentAttribute.uuid,
                null
            );
        }

        // Set the row of the new attribute instance
        newAttributeInstance.table_row = row;

        // Add the new attribute instance to the list of attribute instances in the current attribute
        this.attributeInstance.table_attributes.push(newAttributeInstance);
    }

    async fieldChange(attributeInstance: AttributeInstance) {

        //update attribute value
        attributeInstance.value = attributeInstance.value.toString();

        // URDF kinematics update hook:
        // If the user edits a Joint's Origin table (Roll/Pitch/Yaw/Position) we recompute the
        // robot poses via `urdf-loader` and update all link/joint transforms in the scene.
        //
        // We intentionally keep this check very narrow (Joint + Origin only) to avoid any
        // unintended behavior for non-URDF content.
        try {
            const currentClassName = (this.currentClass?.name || '').toLowerCase();
            const currentAttributeName = (this.currentAttribute?.name || '').toLowerCase();
            const hasUrdfRef = !!(this.currentClassInstance && (this.currentClassInstance as any).urdfRef);

            if (this.currentClassInstance && hasUrdfRef && currentClassName === 'joint' && currentAttributeName === 'origin') {
                // `this.attributeInstance` is the parent (table) attribute instance (Origin).
                // `attributeInstance` is the edited cell.
                await this.urdfPoseService.tryUpdateRobotFromJointOriginEdit(this.currentClassInstance, this.attributeInstance);
            }
        } catch (err) {
            // Non-fatal: fall back to existing vizRep update path.
        }

        await this.vizrepUpdateChecker.checkForVizRepUpdate(attributeInstance);

        //if this.currentClassInstance is set, we are in a classInstance
        if (this.currentClassInstance) {
            await this.hybridAlgorithmsService.checkHybridAlgorithms(null, [this.currentClassInstance]);
        }
        //if this.currentPortInstance is set, we are in a portInstance
        else if (this.currentPortInstance) {
            await this.hybridAlgorithmsService.checkHybridAlgorithms(null, null, [this.currentPortInstance]);
        }

        //patch attribute instance
        //---------------------------------
        // !!! endpoints with instances/attributesInstances are not working
        // instead set tha globalObjectInstance.doSceneInstancePatch to true
        //---------------------------------
        // await this.fetchHelper.attributeInstancesPATCH(attributeInstance.uuid, attributeInstance).then((response) => {
        //   this.logger.log("PATCH attribute instance", response.uuid + " with value " + response.value);
        // });

        this.globalObjectInstance.doSceneInstancePatch = true;

        return Promise.resolve();
    }

    async uiChange(val: any, attributeInstance: AttributeInstance) {

        //update attribute value
        attributeInstance.value = val.toString();

        await this.fieldChange(attributeInstance);
    }

}
