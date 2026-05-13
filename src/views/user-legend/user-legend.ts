import { GlobalDefinition } from 'resources/global_definitions';
import { SharedDocService } from 'resources/collaboration/shared_doc_service';

interface ConnectedUser {
    clientId: number;
    uuid: string;
    username: string;
    color: string;
    initials: string;
    isLocal: boolean;
}

export class UserLegend {
    users: ConnectedUser[] = [];

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private sharedDocService: SharedDocService,
    ) {}

    attached() {
        // Poll awareness state at 500 ms — simple and avoids Aurelia dirty-check issues
        // with awareness event callbacks that fire outside Aurelia's change-detection cycle.
        setInterval(() => this.refresh(), 500);
    }

    get isVisible(): boolean {
        return this.sharedDocService.forTab(this.globalObjectInstance.selectedTab) !== null;
    }

    get disconnectBanner(): string | null {
        return this.sharedDocService.forTab(this.globalObjectInstance.selectedTab)?.disconnectBanner ?? null;
    }

    private refresh(): void {
        const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);
        if (!session) {
            if (this.users.length > 0) this.users = [];
            return;
        }

        const localId = session.awareness.clientID;
        const next: ConnectedUser[] = [];

        for (const [clientId, state] of Array.from(session.awareness.getStates())) {
            const user = state?.user as { uuid?: string; username?: string; color?: string; initials?: string } | undefined;
            if (!user?.uuid) continue;
            next.push({
                clientId,
                uuid: user.uuid,
                username: user.username ?? user.uuid,
                color: user.color ?? 'hsl(0, 70%, 55%)',
                initials: user.initials ?? '?',
                isLocal: clientId === localId,
            });
        }

        // Only reassign if something changed to minimise Aurelia dirty-check churn
        const changed =
            next.length !== this.users.length ||
            next.some((u, i) => u.clientId !== this.users[i]?.clientId || u.color !== this.users[i]?.color);
        if (changed) this.users = next;
    }
}
