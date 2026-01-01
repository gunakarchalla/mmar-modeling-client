import { EventAggregator } from 'aurelia';
import { ClassInstance, AttributeInstance, SceneType, SceneInstance } from '../../../../mmar-global-data-structure';
import { GlobalDefinition } from 'resources/global_definitions';
import { ExpressionUtility } from 'resources/expression_utility';
import { InstanceUtility } from 'resources/services/instance_utility';
import { MetaUtility } from 'resources/services/meta_utility';
import { UrdfPoseService } from 'resources/services/urdf_pose_service';

type JointControl = {
    instance: ClassInstance;
    displayName: string;
    lower: number;
    upper: number;
    value: number;
    step: number;
    disabled: boolean;
};

export class SimulationWindow {
    /**
     * The Robotic System metamodel SceneType UUID.
     * Only when the active tab's sceneType matches this UUID we render the joint sliders.
     */
    private static readonly ROBOTIC_SYSTEM_SCENETYPE_UUID = '113c3133-bf77-493a-a36f-553e77832280';

    /**
     * Fixed metamodel UUIDs from `Context/8_RoboticSystem_metamodel.json`.
     * Meta UUIDs are stable (instance UUIDs are not), so we discover the Joint instances by UUID.
     */
    private static readonly JOINT_META_CLASS_UUID = 'c5cf9a3c-988a-4fd4-87e5-0ad8fcc7234b';
    private static readonly JOINT_NAME_META_ATTRIBUTE_UUID = 'd6632c72-89fa-4210-9d01-18e911505608';
    private static readonly JOINT_LIMIT_META_ATTRIBUTE_UUID = '0994e1e2-3e7f-4b46-b958-b95cd892774e';
    private static readonly LIMIT_LOWER_META_ATTRIBUTE_UUID = '4c55b38d-e64d-41ca-850c-a2dbbb79c833';
    private static readonly LIMIT_UPPER_META_ATTRIBUTE_UUID = 'b7e21682-9194-44c6-8232-8d5c286e0c1a';

    /**
     * Effective UUIDs for the currently active Robotic System scene type.
     *
     * Why this exists:
     * - In MMAR, *meta* UUIDs (metamodel) differ from *instance* UUIDs.
     * - Meta UUIDs are stable within a given metamodel, but the app can load metamodels from DB
     *   that may differ from the `Context/*.json` files in this repo.
     * - URDF import uses the runtime `sceneType.classes` (see `dialog-upload-urdf.ts`) to decide
     *   which meta UUID to assign to `uuid_class`.
     *
     * If our repo constants differ from the runtime metamodel, filtering by the repo constants
     * yields an empty list even though joints exist and render. To keep the UI correct, we
     * resolve the effective UUIDs from the runtime metamodel, with safe fallbacks.
     */
    private effectiveJointMetaClassUuid: string = SimulationWindow.JOINT_META_CLASS_UUID;
    private effectiveJointNameMetaAttributeUuid: string = SimulationWindow.JOINT_NAME_META_ATTRIBUTE_UUID;
    private effectiveJointLimitMetaAttributeUuid: string = SimulationWindow.JOINT_LIMIT_META_ATTRIBUTE_UUID;
    private effectiveLimitLowerMetaAttributeUuid: string = SimulationWindow.LIMIT_LOWER_META_ATTRIBUTE_UUID;
    private effectiveLimitUpperMetaAttributeUuid: string = SimulationWindow.LIMIT_UPPER_META_ATTRIBUTE_UUID;

    loading = false;
    errorMessage = '';

    isRoboticSystemSceneType = false;
    jointControls: JointControl[] = [];

    private tabChangedSub: { dispose(): void } | null = null;
    private urdfUploadedSub: { dispose(): void } | null = null;

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private expressionUtility: ExpressionUtility,
        private instanceUtility: InstanceUtility,
        private metaUtility: MetaUtility,
        private urdfPoseService: UrdfPoseService,
        private eventAggregator: EventAggregator
    ) { }

    async attached() {
        // Keep the simulation panel in sync with active tab changes.
        this.tabChangedSub = this.eventAggregator.subscribe('tabChanged', async () => {
            await this.refresh();
        });

        // When a URDF is imported into the current scene, update the joint list immediately.
        // This is required because the right-nav keeps SimulationWindow attached even when hidden,
        // so it won't re-run `attached()` when switching to SimulationMode.
        this.urdfUploadedSub = this.eventAggregator.subscribe('urdfUploaded', async () => {
            await this.refresh();
        });

        await this.refresh();
    }

    detaching() {
        this.tabChangedSub?.dispose();
        this.tabChangedSub = null;

        this.urdfUploadedSub?.dispose();
        this.urdfUploadedSub = null;
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

        try {
            // IMPORTANT:
            // Do not read tabContext.sceneInstance directly.
            // Other parts of the app (e.g., AttributeWindow) go through InstanceUtility/MetaUtility,
            // which resolve the active scene reliably even after mutations/patches.
            const sceneType = await this.metaUtility.getTabContextSceneType() as SceneType | undefined;
            const sceneInstance = await this.instanceUtility.getTabContextSceneInstance() as SceneInstance | undefined;

            if (!sceneType || !sceneInstance) {
                return;
            }

            this.isRoboticSystemSceneType = sceneType.uuid === SimulationWindow.ROBOTIC_SYSTEM_SCENETYPE_UUID;
            if (!this.isRoboticSystemSceneType) {
                return;
            }

            // Resolve meta UUIDs from the runtime metamodel for this scene.
            await this.resolveEffectiveMetaUuids(sceneType, sceneInstance);

            // IMPORTANT:
            // Meta UUIDs are stable (instance UUIDs are not). Discover Joint instances by fixed meta UUID.
            // Use ExpressionUtility/InstanceUtility helpers (per Expressions wiki) instead of relying on
            // `sceneInstance.class_instances` having fully populated data.
            const instancesByMeta = await this.expressionUtility.getClassInstancesByMetaUUID(
                this.effectiveJointMetaClassUuid
            );

            // `getClassInstancesByMetaUUID` can include relation classes (see implementation),
            // but for simulation sliders we only accept actual ClassInstances.
            const jointInstances = (instancesByMeta || []).filter(i => i instanceof ClassInstance) as ClassInstance[];

            if (jointInstances.length === 0) {
                // Diagnostics to help catch metamodel mismatches in the field.
                // We keep this in `errorMessage` rather than adding extra UI.
                const runtimeJointMeta = sceneType.classes?.find(c => (c?.name || '').toLowerCase() === 'joint');
                const runtimeUuid = runtimeJointMeta?.uuid;
                this.errorMessage =
                    `No Joint instances found in the active scene. ` +
                    `Using joint meta UUID '${this.effectiveJointMetaClassUuid}'.` +
                    (runtimeUuid && runtimeUuid !== this.effectiveJointMetaClassUuid
                        ? ` Runtime sceneType Joint UUID is '${runtimeUuid}' (metamodel mismatch).`
                        : '');
                return;
            }

            const controls: JointControl[] = [];
            for (const jointInstance of jointInstances) {
                const displayName = await this.getDisplayName(jointInstance);
                const { lower, upper } = await this.readLimitBounds(jointInstance);

                // Defensive normalization: ensure lower <= upper for a usable slider.
                const normalizedLower = Math.min(lower, upper);
                const normalizedUpper = Math.max(lower, upper);
                const range = normalizedUpper - normalizedLower;

                // Initialize at 0 if inside bounds, otherwise clamp.
                const initialValue = this.clamp(0, normalizedLower, normalizedUpper);

                // Choose a small step for a smooth feel; keep it stable for tiny ranges.
                const step = range > 0 ? Math.max(range / 100, 0.001) : 1;

                controls.push({
                    instance: jointInstance,
                    displayName,
                    lower: normalizedLower,
                    upper: normalizedUpper,
                    value: initialValue,
                    step,
                    disabled: range === 0,
                });
            }

            this.jointControls = controls;
        } catch (err: any) {
            this.errorMessage = err?.message || String(err);
        } finally {
            this.loading = false;
        }
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

    private async getDisplayName(instance: ClassInstance): Promise<string> {
        // Prefer value lookup by meta attribute UUID (ExpressionUtility pattern).
        const nameAttr = await this.instanceUtility.getAttributeInstanceFromAnyInstance(
            this.effectiveJointNameMetaAttributeUuid,
            instance.uuid,
            'uuid'
        );
        if (nameAttr?.value != null) return String(nameAttr.value);

        // Fallback: some instance payloads may carry attribute names.
        const nameAttrByName = (instance.attribute_instance || []).find((a: any) => a?.name === 'Name');
        if (nameAttrByName?.value != null) return String(nameAttrByName.value);

        return instance.name || instance.uuid;
    }

    /**
     * Reads joint limits from the Joint instance's `Limit` table attribute.
     * Bounds are expected to be present as table columns named `Lower` and `Upper`.
     */
    private async readLimitBounds(jointInstance: ClassInstance): Promise<{ lower: number; upper: number }> {
        // Discover the `Limit` table by fixed meta UUID.
        const limitAttr = await this.instanceUtility.getAttributeInstanceFromAnyInstance(
            this.effectiveJointLimitMetaAttributeUuid,
            jointInstance.uuid,
            'uuid'
        );

        if (!limitAttr) {
            // Fallback for legacy payloads (name-based).
            const limitAttrByName = (jointInstance.attribute_instance || []).find(
                (a: any) => a?.name === 'Limit'
            ) as AttributeInstance | undefined;
            if (!limitAttrByName) return { lower: 0, upper: 0 };
            return this.readLimitBoundsFromTableAttributes(limitAttrByName);
        }

        return this.readLimitBoundsFromTableAttributes(limitAttr);
    }

    private readLimitBoundsFromTableAttributes(limitAttr: AttributeInstance): { lower: number; upper: number } {
        const cells = (limitAttr as any).table_attributes as AttributeInstance[] | undefined;
        if (!cells?.length) {
            return { lower: 0, upper: 0 };
        }

        let lower = 0;
        let upper = 0;

        for (const cell of cells) {
            const value = this.toNumber((cell as any)?.value);

            if (cell.uuid_attribute === this.effectiveLimitLowerMetaAttributeUuid) lower = value;
            if (cell.uuid_attribute === this.effectiveLimitUpperMetaAttributeUuid) upper = value;
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

    private async resolveEffectiveMetaUuids(sceneType: SceneType, sceneInstance?: SceneInstance): Promise<void> {
        // Defaults (repo constants)
        this.effectiveJointMetaClassUuid = SimulationWindow.JOINT_META_CLASS_UUID;
        this.effectiveJointNameMetaAttributeUuid = SimulationWindow.JOINT_NAME_META_ATTRIBUTE_UUID;
        this.effectiveJointLimitMetaAttributeUuid = SimulationWindow.JOINT_LIMIT_META_ATTRIBUTE_UUID;
        this.effectiveLimitLowerMetaAttributeUuid = SimulationWindow.LIMIT_LOWER_META_ATTRIBUTE_UUID;
        this.effectiveLimitUpperMetaAttributeUuid = SimulationWindow.LIMIT_UPPER_META_ATTRIBUTE_UUID;

        // Best-effort: resolve the Joint class UUID from the runtime sceneType classes.
        // Note: depending on how the SceneType is loaded, `classes` can be partially populated
        // (e.g., missing `name`). We keep a fallback below.
        const runtimeJointMeta = sceneType.classes?.find(c => (c?.name || '').toLowerCase() === 'joint');
        if (runtimeJointMeta?.uuid) {
            this.effectiveJointMetaClassUuid = runtimeJointMeta.uuid;
        } else {
            // Fallback: derive the effective joint meta UUID from the actual imported instances.
            // URDF import annotates created instances with `urdfRef = { kind: 'joint', name }`.
            const urdfJointInstance = (sceneInstance?.class_instances || []).find(
                (ci: any) => ci && (ci as any).urdfRef?.kind === 'joint' && (ci as any).uuid_class
            ) as any;

            if (urdfJointInstance?.uuid_class) {
                this.effectiveJointMetaClassUuid = String(urdfJointInstance.uuid_class);
            } else {
                // No runtime info available; keep repo defaults.
                return;
            }
        }

        try {
            // Resolve attribute UUIDs from the runtime metamodel for the effective Joint class.
            const jointMetaClass = await this.metaUtility.getMetaClass(this.effectiveJointMetaClassUuid);
            const nameAttrDef = jointMetaClass?.attributes?.find(a => (a?.name || '').toLowerCase() === 'name');
            const limitAttrDef = jointMetaClass?.attributes?.find(a => (a?.name || '').toLowerCase() === 'limit');

            if (nameAttrDef?.uuid) this.effectiveJointNameMetaAttributeUuid = nameAttrDef.uuid;
            if (limitAttrDef?.uuid) this.effectiveJointLimitMetaAttributeUuid = limitAttrDef.uuid;

            // Resolve table column UUIDs for Lower/Upper from the Limit attribute type.
            const cols = limitAttrDef?.attribute_type?.has_table_attribute || [];
            const lowerCol = cols.find((c: any) => (c?.attribute?.name || '').toLowerCase() === 'lower')?.attribute;
            const upperCol = cols.find((c: any) => (c?.attribute?.name || '').toLowerCase() === 'upper')?.attribute;
            if (lowerCol?.uuid) this.effectiveLimitLowerMetaAttributeUuid = lowerCol.uuid;
            if (upperCol?.uuid) this.effectiveLimitUpperMetaAttributeUuid = upperCol.uuid;
        } catch {
            // If runtime metamodel lookup fails for any reason, keep repo constant defaults.
        }
    }
}