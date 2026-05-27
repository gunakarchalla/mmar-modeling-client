import { GlobalDefinition } from "resources/global_definitions";
import { PersistencyHandler } from "resources/persistency_handler";
import { SharedDocService } from "resources/collaboration/shared_doc_service";
import { Logger } from 'resources/services/logger';

export class AutoSave {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private logger: Logger,
        private persistencyHandler: PersistencyHandler,
        private sharedDocService: SharedDocService
    ) {
    }

    async attached() {
        setInterval(async () => {
            const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);
            const isShared = session !== null;

            if (isShared) {
                // Force auto-save on in shared mode
                if (!this.globalObjectInstance.autoSave) {
                    this.globalObjectInstance.autoSave = true;
                }
                // Only save when a local-origin change is pending and the user has write access
                if (this.globalObjectInstance.doSceneInstancePatchLocal && session.access !== 'read') {
                    this.logger.log('AutoSave (shared): saving local changes', 'info');
                    await this.persistencyHandler.persistSceneInstanceToDB();
                    this.globalObjectInstance.doSceneInstancePatchLocal = false;
                } else if (this.globalObjectInstance.doSceneInstancePatchLocal && session.access === 'read') {
                    window.alert("You don't have enough authorization to edit this scene instance.");
                    this.globalObjectInstance.doSceneInstancePatchLocal = false;
                }
            } else {
                // Non-shared: existing behaviour
                if (this.globalObjectInstance.autoSave && this.globalObjectInstance.doSceneInstancePatch) {
                    this.logger.log('AutoSave: ' + this.globalObjectInstance.autoSave, 'info');
                    await this.persistencyHandler.persistSceneInstanceToDB();
                    this.globalObjectInstance.doSceneInstancePatch = false;
                }
            }
        }, 5000);
    }

    async toggle() {
        // Guard: no-op when shared — the toggle is locked in shared mode
        if (this.sharedDocService.forTab(this.globalObjectInstance.selectedTab)) return;
        this.globalObjectInstance.autoSave = !this.globalObjectInstance.autoSave;
        this.logger.log('AutoSave toggle: ' + this.globalObjectInstance.autoSave, 'info');
    }

    get isShared(): boolean {
        return this.sharedDocService.forTab(this.globalObjectInstance.selectedTab) !== null;
    }
}
