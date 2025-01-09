import { DeletionHandler } from './../../resources/deletion_handler';
import { GlobalDefinition } from "../../resources/global_definitions";
import { Logger } from "resources/services/logger";

export class ToolbarContainer {


    constructor(
        private logger: Logger,
        private globalObjectInstance: GlobalDefinition,
        private deletionHandler: DeletionHandler
    ) { }

    zoomIn() {
        this.logger.log('zoomIn', 'info');
    }

    zoomOut() {
        this.logger.log('zoomOut', 'info');
    }

    undo() {
        this.logger.log('undo', 'info');
    }

    redo() {
        this.logger.log('redo', 'info');
    }

    delete() {
        this.logger.log('delete', 'info');
        this.deletionHandler.onPressDelete();
    }
    

    copy() {
        console.log('copy');
    }

    paste() {
        console.log('paste');
    }

    removeJWT(){
        localStorage.removeItem("jwtToken");
        //reload page
        location.reload();
    }
    
}
