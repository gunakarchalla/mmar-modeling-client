import { bindable } from 'aurelia';
import { jwtDecode } from 'jwt-decode';
import { FetchHelper, AccessEntry } from '../../resources/services/fetchHelper';
import { GlobalDefinition } from '../../resources/global_definitions';
import { Logger } from '../../resources/services/logger';

interface JwtPayload {
    uuid: string;
    username: string;
    exp?: number;
}

type AccessLevel = 'read' | 'edit' | 'delete';

export class ShareSceneInstance {
    @bindable tree = null;

    allSceneInstances: { uuid: string; name: string }[] = [];
    selectedSceneInstance: { uuid: string; name: string } | null = null;
    existingAccess: AccessEntry[] = [];
    levelChoice: AccessLevel = 'read';
    usernameInput = '';
    canManage = false;
    errorMsg = '';
    currentUserUuid = '';
    loading = false;

    constructor(
        private fetchHelper: FetchHelper,
        private globalObjectInstance: GlobalDefinition,
        private logger: Logger
    ) {}

    attached() {
        try {
            const token = this.globalObjectInstance.accessToken;
            if (token) {
                const decoded = jwtDecode<JwtPayload>(token);
                this.currentUserUuid = decoded.uuid;
            }
        } catch {
            // ignore decode errors
        }
        this.buildSceneInstancesList();
    }

    treeChanged() {
        this.buildSceneInstancesList();
    }

    private buildSceneInstancesList() {
        this.allSceneInstances = [];
        if (!this.tree) return;
        for (const sceneType of this.tree) {
            if (sceneType.children) {
                for (const si of sceneType.children) {
                    this.allSceneInstances.push(si);
                }
            }
        }
    }

    async onSceneInstanceChange(event: CustomEvent) {
        this.selectedSceneInstance = event.detail.value;
        this.errorMsg = '';
        this.usernameInput = '';
        this.existingAccess = [];
        this.canManage = false;

        if (!this.selectedSceneInstance) return;
        await this.loadAccessList();
    }

    private async loadAccessList() {
        if (!this.selectedSceneInstance) return;
        this.loading = true;
        try {
            const [list, me] = await Promise.all([
                this.fetchHelper.sceneAccessListGET(this.selectedSceneInstance.uuid),
                this.fetchHelper.sceneAccessMeGET(this.selectedSceneInstance.uuid)
            ]);
            this.existingAccess = list || [];
            this.canManage = me?.level === 'delete';
        } catch {
            this.existingAccess = [];
            this.canManage = false;
        }
        this.loading = false;
    }

    async add() {
        if (!this.usernameInput?.trim()) {
            this.errorMsg = 'Username is required';
            return;
        }
        this.errorMsg = '';
        try {
            const user = await this.fetchHelper.userByUsernameGET(this.usernameInput.trim());
            const entry = await this.fetchHelper.sceneAccessPOST(
                this.selectedSceneInstance.uuid,
                { uuid_user: user.uuid, access: this.levelChoice }
            );
            const existingIndex = this.existingAccess.findIndex(a => a.uuid_user === user.uuid);
            if (existingIndex >= 0) {
                this.existingAccess[existingIndex] = entry;
            } else {
                this.existingAccess.push(entry);
            }
            this.usernameInput = '';
            this.logger.log(`Granted ${this.levelChoice} access to ${user.username} on scene ${this.selectedSceneInstance.uuid}`, 'info');
        } catch (err: any) {
            if (err?.status === 404) {
                this.errorMsg = 'User not found';
            } else if (err?.status === 409) {
                this.errorMsg = 'Cannot remove the last delete owner';
            } else {
                this.errorMsg = 'An error occurred while granting access';
            }
        }
    }

    async removeAccess(entry: AccessEntry) {
        if (!this.selectedSceneInstance) return;
        try {
            await this.fetchHelper.sceneAccessDELETE(this.selectedSceneInstance.uuid, entry.uuid_user);
            this.existingAccess = this.existingAccess.filter(a => a.uuid_user !== entry.uuid_user);
            this.logger.log(`Revoked access for ${entry.username} on scene ${this.selectedSceneInstance.uuid}`, 'info');
        } catch (err: any) {
            if (err?.status === 409) {
                this.errorMsg = 'Cannot remove the last delete owner';
            } else {
                this.errorMsg = 'An error occurred while revoking access';
            }
        }
    }

    cancel() {
        this.usernameInput = '';
        this.errorMsg = '';
    }

    levelLabel(entry: AccessEntry): string {
        if (entry.delete_access) return 'delete';
        if (entry.edit_access) return 'edit';
        return 'read';
    }
}
