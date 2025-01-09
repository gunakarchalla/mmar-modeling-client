import { GlobalDefinition } from "resources/global_definitions";
import { InstanceCreationHandler } from "resources/instance_creation_handler";
import { MetaUtility } from "resources/services/meta_utility";
import { AttributeInstance, Attribute, AttributeType, UUID, Class } from "../../../../mmar-global-data-structure";
import { ColumnStructure } from "../../../../mmar-global-data-structure/models/meta/Metamodel_columns.structure";
import { bindable } from "aurelia";

export class DialogTableAttribute {

    @bindable attributeInstance: AttributeInstance = null;

    private currentAttribute: Attribute;
    private currentAttributeType: AttributeType;

    private table = [];
    private columns = [];
    private rows = [];

    private currentClass: Class;

    //all columns of the table
    private has_table_attribute: ColumnStructure[] = [];

    //all cells of the table
    private tableAttributes: AttributeInstance[] = [];


    constructor(
        private golbalObjectInstance: GlobalDefinition,
        private metaUtility: MetaUtility,
        private instanceCreationHandler: InstanceCreationHandler
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
    }

    async setMetaInformation() {
        const attributeUUID: UUID = this.attributeInstance.uuid_attribute;
        this.currentClass = await this.metaUtility.getMetaClass(this.golbalObjectInstance.current_class_instance.uuid_class);
        this.currentAttribute = this.currentClass.attributes.find(attribute => attribute.uuid === attributeUUID);
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

        let rowCount = 0;
        for (let i = 0; i < this.tableAttributes.length; i+= this.columns.length) {
            this.rows.push([]);
            
            //for each column
            for (let j = 0; j < this.columns.length; j++) {
                this.rows[rowCount].push(this.tableAttributes[i + j]);
            }
            rowCount++;
        }
    }


    async ok() {
        console.log('ok');
    }

    async close() {
        console.log('close');
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
        let newAttributeInstance: AttributeInstance = await this.instanceCreationHandler.createAttributeInstance(
            parentAttributeColumn.attribute,
            null,
            null,
            //get attribute type default value
            parentAttributeColumn.attribute.default_value ? parentAttributeColumn.attribute.default_value : "not defined" ,
            null,
            null,
            null,
            null,
            this.currentAttribute.uuid,
            null
        );

        // Set the row of the new attribute instance
        newAttributeInstance.table_row = row;

        // Add the new attribute instance to the list of attribute instances in the current attribute
        this.attributeInstance.table_attributes.push(newAttributeInstance);
    }


}
