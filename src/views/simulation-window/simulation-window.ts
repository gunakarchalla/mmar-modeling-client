import { EventAggregator } from 'aurelia';
import { ClassInstance, AttributeInstance, SceneType, SceneInstance } from '../../../../mmar-global-data-structure';
import { MetaUtility } from 'resources/services/meta_utility';
import { UrdfPoseService } from 'resources/services/urdf_pose_service';
import { InstanceUtility } from 'resources/services/instance_utility';

type JointControl = {
    instance: ClassInstance;
    displayName: string;
    lower: number;
    upper: number;
    value: number;
    step?: number;
    disabled?: boolean;
};

export class SimulationWindow {
    /**
     * The Robotic System metamodel SceneType UUID.
     * Only when the active tab's sceneType matches this UUID we render the joint sliders.
     */
    private static readonly ROBOTIC_SYSTEM_SCENETYPE_UUID = '113c3133-bf77-493a-a36f-553e77832280';
    private static readonly META_JOINT_UUID = 'c5cf9a3c-988a-4fd4-87e5-0ad8fcc7234b';

    loading = false;
    errorMessage = '';

    isRoboticSystemSceneType = false;
    jointControls: JointControl[] = [];
    private tabChangedSub: any = null;
    private sceneInstanceMutatedSub: any = null;
    private refreshTimer: any = null;

    constructor(
        private metaUtility: MetaUtility,
        private urdfPoseService: UrdfPoseService,
        private eventAggregator: EventAggregator,
        private instanceUtility: InstanceUtility,
    ) { }

    async attached() {
        // Keep the simulation panel in sync with active tab changes.
        this.tabChangedSub = this.eventAggregator.subscribe('tabChanged', async () => {
            this.requestRefresh();
            // await this.refresh();
        });

        // Recompute the joint list when instances are added/removed from the active SceneInstance.
        this.sceneInstanceMutatedSub = this.eventAggregator.subscribe('sceneInstanceMutated', async (payload: any) => {
            const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
            const activeSceneInstanceUuid = sceneInstance?.uuid;
            if (!activeSceneInstanceUuid) return;

            // Only refresh if the mutation applies to the currently active SceneInstance.
            if (payload?.sceneInstanceUuid === activeSceneInstanceUuid) {
                this.requestRefresh();
                // await this.refresh();
            }
        });

        this.requestRefresh();
    }

    detaching() {
        this.tabChangedSub?.dispose();
        this.tabChangedSub = null;

        this.sceneInstanceMutatedSub?.dispose();
        this.sceneInstanceMutatedSub = null;

        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * Coalesces multiple refresh requests into a single refresh call.
     */
    private requestRefresh() {
        if (this.refreshTimer) return;
        this.refreshTimer = setTimeout(async () => {
            this.refreshTimer = null;
            await this.refresh();
        }, 100);
    }

    /**
     * Recomputes all joint slider view models for the current tab.
     *
     * Note: We intentionally read from the open tab context (sceneType + sceneInstance)
     * because SimulationMode is defined per active tab.
     */
    async refresh() {
        this.loading = true;
        this.errorMessage = '';
        this.jointControls = [];
        this.isRoboticSystemSceneType = false;

        const sceneType = await this.metaUtility.getTabContextSceneType();
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();

        if (!sceneType || !sceneInstance) {
            this.loading = false;
            return;
        }

        this.isRoboticSystemSceneType = sceneType.uuid === SimulationWindow.ROBOTIC_SYSTEM_SCENETYPE_UUID;
        if (!this.isRoboticSystemSceneType) {
            this.loading = false;
            return;
        }

        const jointInstances = sceneInstance.class_instances.filter(ci => ci?.uuid_class === SimulationWindow.META_JOINT_UUID);

        const controls: JointControl[] = [];
        for (const jointInstance of jointInstances) {
            const displayName = this.getDisplayName(jointInstance);
            const { lower, upper } = await this.readLimitBounds(jointInstance);

            // Initialize the slider with the robot's current joint value (if available).
            // We clamp to the joint limits to avoid invalid UI states when limits are missing/incorrect.
            const lowerRounded = Math.round(lower * 100) / 100;
            const upperRounded = Math.round(upper * 100) / 100;
            const currentJointValue = this.urdfPoseService.tryGetRobotJointValue(jointInstance) ?? 0;
            const initialValue = this.clamp(currentJointValue, lowerRounded, upperRounded);

            controls.push({
                instance: jointInstance,
                displayName,
                lower: lowerRounded,
                upper: upperRounded,
                value: initialValue,
                step: 0.01,
                disabled: false,
            });
        }

        this.jointControls = controls;

        this.loading = false;

    }

    /**
     * Slider callback.
     * We keep this handler tolerant to the MDC slider emitting string values.
     */
    async onJointValueChanged(ctrl: JointControl) {
        const value = this.toNumber(ctrl.value);
        ctrl.value = value;

        // Clamp to guard against UI edge cases.
        const clamped = this.clamp(value, ctrl.lower, ctrl.upper);
        ctrl.value = clamped;

        await this.urdfPoseService.tryUpdateRobotFromJointValue(ctrl.instance, clamped);
    }

    private getDisplayName(instance: ClassInstance): string {
        // Prefer the explicit Name attribute value set during URDF import.
        const nameAttr = (instance.attribute_instance || []).find((a: any) => a?.name === 'Name');
        if (nameAttr?.value) return String(nameAttr.value);
        return instance.name || instance.uuid;
    }

    /**
     * Reads joint limits from the Joint instance's `Limit` table attribute.
     * Bounds are expected to be present as table columns named `Lower` and `Upper`.
     */
    private async readLimitBounds(jointInstance: ClassInstance): Promise<{ lower: number; upper: number }> {
        const limitAttr = (jointInstance.attribute_instance || []).find((a: any) => a?.name === 'Limit') as AttributeInstance | undefined;
        if (!limitAttr) {
            return { lower: 0, upper: 0 };
        }

        const cells = (limitAttr as any).table_attributes as AttributeInstance[] | undefined;
        if (!cells?.length) {
            return { lower: 0, upper: 0 };
        }

        let lower = 0;
        let upper = 0;

        for (const cell of cells) {
            // Prefer meta attribute name resolution (stable even if instance cell.name differs).
            const metaAttr = await this.metaUtility.getMetaAttribute(cell.uuid_attribute);
            const columnName = metaAttr?.name || (cell as any)?.name;
            const value = this.toNumber((cell as any)?.value);

            if (columnName === 'Lower') lower = value;
            if (columnName === 'Upper') upper = value;
        }

        return { lower, upper };
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }

    private toNumber(value: any): number {
        const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
        return Number.isFinite(n) ? n : 0;
    }
}