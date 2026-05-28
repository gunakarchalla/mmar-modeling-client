import * as Y from 'yjs';
import * as THREE from 'three';
import { SceneInstance, ClassInstance, AttributeInstance, RelationclassInstance, RoleInstance } from '../../../../mmar-global-data-structure';
import { GlobalDefinition } from '../global_definitions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalChangeType =
    | { type: 'coordinates'; classInstanceUuid: string; x: number; y: number; z: number }
    | { type: 'rotation'; classInstanceUuid: string; x: number; y: number; z: number; w: number }
    | { type: 'attribute_value'; classInstanceUuid: string; attributeUuid: string; value: string }
    | { type: 'add_class_instance'; classInstance: ClassInstance }
    | { type: 'remove_class_instance'; classInstanceUuid: string }
    | { type: 'add_relation_class_instance'; relationClassInstance: RelationclassInstance }
    | { type: 'remove_relation_class_instance'; relationClassInstanceUuid: string }
    | { type: 'relation_attribute_value'; relationClassInstanceUuid: string; attributeUuid: string; value: string };

/** Carries side-effect metadata back to the observer in SharedDocService. */
export interface YDocChangeResult {
    classInstanceAdded: boolean;
    relationInstanceAdded: boolean;
    changedAttributeInstances: AttributeInstance[];
}

// ---------------------------------------------------------------------------
// Populate Y.Doc from a freshly loaded SceneInstance
// ---------------------------------------------------------------------------

export function sceneInstanceToYDoc(sceneInstance: SceneInstance, ydoc: Y.Doc, origin?: object): void {
    ydoc.transact(() => {
        // meta
        const meta = ydoc.getMap<string>('meta');
        meta.set('uuid', sceneInstance.uuid ?? '');
        meta.set('uuid_scene_type', sceneInstance.uuid_scene_type ?? '');
        meta.set('name', sceneInstance.name ?? '');
        meta.set('description', sceneInstance.description ?? '');

        // class_instances
        const classInstances = ydoc.getMap<Y.Map<unknown>>('class_instances');
        for (const ci of sceneInstance.class_instances ?? []) {
            classInstances.set(ci.uuid, classInstanceToYMap(ci));
        }

        // relationclasses_instances
        const relInstances = ydoc.getMap<Y.Map<unknown>>('relationclasses_instances');
        for (const ri of sceneInstance.relationclasses_instances ?? []) {
            relInstances.set(ri.uuid, relationClassInstanceToYMap(ri));
        }

        // role_instances, attribute_instances, port_instances (stored as JSON blobs)
        const roleInstances = ydoc.getMap<string>('role_instances');
        for (const ri of sceneInstance.role_instances ?? []) {
            roleInstances.set(ri.uuid, JSON.stringify(ri));
        }
        const attrInstances = ydoc.getMap<string>('attribute_instances');
        for (const ai of sceneInstance.attribute_instances ?? []) {
            attrInstances.set(ai.uuid, JSON.stringify(ai));
        }
        const portInstances = ydoc.getMap<string>('port_instances');
        for (const pi of sceneInstance.port_instances ?? []) {
            portInstances.set(pi.uuid, JSON.stringify(pi));
        }
    }, origin);
}

// ---------------------------------------------------------------------------
// Write a single local delta to the Y.Doc (local origin prevents observer echo)
// ---------------------------------------------------------------------------

export function applyLocalChangeToYDoc(
    ydoc: Y.Doc,
    change: LocalChangeType,
    origin: object
): void {
    ydoc.transact(() => {
        const classInstances = ydoc.getMap<Y.Map<unknown>>('class_instances');

        switch (change.type) {
            case 'coordinates': {
                const ciMap = classInstances.get(change.classInstanceUuid);
                if (!ciMap) break;
                const coordMap = ciMap.get('coordinates_2d') as Y.Map<number>;
                if (!coordMap) break;
                coordMap.set('x', change.x);
                coordMap.set('y', change.y);
                coordMap.set('z', change.z);
                break;
            }
            case 'rotation': {
                const ciMap = classInstances.get(change.classInstanceUuid);
                if (!ciMap) break;
                const rotMap = ciMap.get('rotation') as Y.Map<number>;
                if (!rotMap) break;
                rotMap.set('x', change.x);
                rotMap.set('y', change.y);
                rotMap.set('z', change.z);
                rotMap.set('w', change.w);
                break;
            }
            case 'attribute_value': {
                const ciMap = classInstances.get(change.classInstanceUuid);
                if (!ciMap) break;
                const attrMap = ciMap.get('attribute_instance') as Y.Map<Y.Map<unknown>>;
                if (!attrMap) break;
                const attrEntry = attrMap.get(change.attributeUuid);
                if (!attrEntry) break;
                attrEntry.set('value', change.value);
                break;
            }
            case 'add_class_instance': {
                const ci = change.classInstance;
                classInstances.set(ci.uuid, classInstanceToYMap(ci));
                break;
            }
            case 'remove_class_instance': {
                classInstances.delete(change.classInstanceUuid);
                break;
            }

            // ------------------------------------------------------------------
            // RelationclassInstance mutations
            // ------------------------------------------------------------------
            case 'add_relation_class_instance': {
                const ri = change.relationClassInstance;
                const relInstances = ydoc.getMap<Y.Map<unknown>>('relationclasses_instances');
                relInstances.set(ri.uuid, relationClassInstanceToYMap(ri));
                break;
            }
            case 'remove_relation_class_instance': {
                const relInstances = ydoc.getMap<Y.Map<unknown>>('relationclasses_instances');
                relInstances.delete(change.relationClassInstanceUuid);
                break;
            }
            case 'relation_attribute_value': {
                const relInstances = ydoc.getMap<Y.Map<unknown>>('relationclasses_instances');
                const riMap = relInstances.get(change.relationClassInstanceUuid);
                if (!riMap) break;
                const attrMap = riMap.get('attribute_instance') as Y.Map<Y.Map<unknown>>;
                if (!attrMap) break;
                const attrEntry = attrMap.get(change.attributeUuid);
                if (!attrEntry) break;
                attrEntry.set('value', change.value);
                break;
            }
        }
    }, origin);
}

// ---------------------------------------------------------------------------
// Apply a Yjs deep event to the in-memory SceneInstance + Three.js scene.
// Called ONLY for remote-origin events (local-origin events are skipped by the
// SharedDocService observer because the in-memory model was already updated).
// ---------------------------------------------------------------------------

export function applyYDocChangeToSceneInstance(
    event: Y.YEvent<Y.Map<unknown>>,
    sceneInstance: SceneInstance,
    threeScene: THREE.Scene,
    globalDef: GlobalDefinition
): YDocChangeResult {
    const result: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [] };
    const path = event.path as Array<string | number>;

    // Path is relative to the 'class_instances' Y.Map (the observeDeep root).
    if (path.length === 0) {
        (event as Y.YMapEvent<Y.Map<unknown>>).changes.keys.forEach((change, uuid) => {
            if (change.action === 'delete') {
                // Remove from in-memory sceneInstance
                const idx = sceneInstance.class_instances.findIndex(c => c.uuid === uuid);
                if (idx !== -1) sceneInstance.class_instances.splice(idx, 1);
                // Remove Three.js object
                const obj = threeScene.getObjectByProperty('uuid', uuid);
                if (obj) threeScene.remove(obj);
                // Remove from drag objects of the current tab
                const tabCtx = globalDef.tabContext[globalDef.selectedTab];
                if (tabCtx) {
                    tabCtx.contextDragObjects = tabCtx.contextDragObjects.filter(o => o.uuid !== uuid);
                }
                globalDef.dragObjects = globalDef.dragObjects.filter(o => o.uuid !== uuid);
            } else if (change.action === 'add') {
                // Reconstruct the ClassInstance from the Y.Map and add to the in-memory model.
                const classInstancesMap = event.target as Y.Map<Y.Map<unknown>>;
                const newInstanceMap = classInstancesMap.get(uuid);
                if (newInstanceMap && !sceneInstance.class_instances.find(c => c.uuid === uuid)) {
                    const newCi = classInstanceFromYMap(newInstanceMap);
                    sceneInstance.class_instances.push(newCi);
                    // Register the new attribute instances in the global flat list
                    for (const ai of newCi.attribute_instance) {
                        if (!globalDef.attribute_instances.find(a => a.uuid === ai.uuid)) {
                            globalDef.attribute_instances.push(ai);
                        }
                    }
                    result.classInstanceAdded = true;
                }
            }
        });
        return result;
    }

    const classInstanceUuid = path[0] as string;
    const changedField = path[1] as string | undefined;

    // coordinates_2d nested Y.Map changed
    if (changedField === 'coordinates_2d') {
        const coordMap = event.target as Y.Map<number>;
        const ci = sceneInstance.class_instances.find(c => c.uuid === classInstanceUuid);
        if (ci && ci.coordinates_2d) {
            if (coordMap.has('x')) ci.coordinates_2d.x = coordMap.get('x')!;
            if (coordMap.has('y')) ci.coordinates_2d.y = coordMap.get('y')!;
            if (coordMap.has('z')) ci.coordinates_2d.z = coordMap.get('z')!;
            // Mirror to Three.js object
            threeScene.traverse(obj => {
                if (obj.uuid === classInstanceUuid) {
                    obj.position.set(
                        ci.coordinates_2d.x,
                        ci.coordinates_2d.y,
                        ci.coordinates_2d.z
                    );
                }
            });
        }
        return result;
    }

    // rotation nested Y.Map changed
    if (changedField === 'rotation') {
        const rotMap = event.target as Y.Map<number>;
        const ci = sceneInstance.class_instances.find(c => c.uuid === classInstanceUuid);
        if (ci && ci.rotation) {
            if (rotMap.has('x')) ci.rotation.x = rotMap.get('x')!;
            if (rotMap.has('y')) ci.rotation.y = rotMap.get('y')!;
            if (rotMap.has('z')) ci.rotation.z = rotMap.get('z')!;
            if (rotMap.has('w')) ci.rotation.w = rotMap.get('w')!;
            threeScene.traverse(obj => {
                if (obj.uuid === classInstanceUuid) {
                    (obj as THREE.Mesh).quaternion.set(
                        ci.rotation.x,
                        ci.rotation.y,
                        ci.rotation.z,
                        ci.rotation.w
                    );
                }
            });
        }
        return result;
    }

    // attribute_instance Y.Map: a specific attribute entry changed
    if (path.length >= 3 && changedField === 'attribute_instance') {
        const attrUuid = path[2] as string;
        const ci = sceneInstance.class_instances.find(c => c.uuid === classInstanceUuid);
        if (!ci) return result;
        const attrInst = ci.attribute_instance.find(a => a.uuid === attrUuid);
        if (!attrInst) return result;
        const attrMap = event.target as Y.Map<unknown>;
        if (attrMap.has('value')) {
            attrInst.value = attrMap.get('value') as string;
            // Signal the caller to trigger a VizRep update for this attribute
            result.changedAttributeInstances.push(attrInst);
        }
        return result;
    }

    // Scalar fields directly on the class instance Y.Map (name, description, etc.)
    if (path.length === 1 && changedField === undefined) {
        const ci = sceneInstance.class_instances.find(c => c.uuid === classInstanceUuid);
        if (!ci) return result;
        const ciMap = event.target as Y.Map<unknown>;
        (event as Y.YMapEvent<unknown>).changes.keys.forEach((_change, key) => {
            if (key === 'name') ci.name = ciMap.get('name') as string;
            if (key === 'description') ci.description = ciMap.get('description') as string;
        });
    }

    return result;
}

// ---------------------------------------------------------------------------
// Apply a Yjs deep event from 'relationclasses_instances' to the in-memory
// SceneInstance. Called ONLY for remote-origin events.
// ---------------------------------------------------------------------------

export function applyYDocRelationChangeToSceneInstance(
    event: Y.YEvent<Y.Map<unknown>>,
    sceneInstance: SceneInstance,
    threeScene: THREE.Scene,
    globalDef: GlobalDefinition
): YDocChangeResult {
    const result: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [] };
    const path = event.path as Array<string | number>;

    // Top-level add / delete of an entire RelationclassInstance entry
    if (path.length === 0) {
        (event as Y.YMapEvent<Y.Map<unknown>>).changes.keys.forEach((change, uuid) => {
            if (change.action === 'delete') {
                const idx = sceneInstance.relationclasses_instances.findIndex(r => r.uuid === uuid);
                if (idx !== -1) sceneInstance.relationclasses_instances.splice(idx, 1);
                const obj = threeScene.getObjectByProperty('uuid', uuid);
                if (obj) threeScene.remove(obj);
                globalDef.dragObjects = globalDef.dragObjects.filter(o => o.uuid !== uuid);
                // Remove role instances that belong to this relation
                globalDef.role_instances = globalDef.role_instances.filter(
                    r => r.uuid_relationclass !== uuid
                );
            } else if (change.action === 'add') {
                // Reconstruct the RelationclassInstance from the Y.Map.
                const relMap = event.target as Y.Map<Y.Map<unknown>>;
                const newInstanceMap = relMap.get(uuid);
                if (newInstanceMap && !sceneInstance.relationclasses_instances.find(r => r.uuid === uuid)) {
                    const newRi = relationClassInstanceFromYMap(newInstanceMap);
                    sceneInstance.relationclasses_instances.push(newRi);
                    // Register attribute instances in the global flat list
                    for (const ai of newRi.attribute_instance) {
                        if (!globalDef.attribute_instances.find(a => a.uuid === ai.uuid)) {
                            globalDef.attribute_instances.push(ai);
                        }
                    }
                    // Register role instances in the global flat list
                    if (newRi.role_instance_from && !globalDef.role_instances.find(r => r.uuid === newRi.role_instance_from.uuid)) {
                        globalDef.role_instances.push(newRi.role_instance_from);
                    }
                    if (newRi.role_instance_to && !globalDef.role_instances.find(r => r.uuid === newRi.role_instance_to.uuid)) {
                        globalDef.role_instances.push(newRi.role_instance_to);
                    }
                    result.relationInstanceAdded = true;
                }
            }
        });
        return result;
    }

    const relationClassInstanceUuid = path[0] as string;
    const changedField = path[1] as string | undefined;

    // attribute_instance nested Y.Map: a specific attribute entry value changed
    if (path.length >= 3 && changedField === 'attribute_instance') {
        const attrUuid = path[2] as string;
        const ri = sceneInstance.relationclasses_instances.find(r => r.uuid === relationClassInstanceUuid);
        if (!ri) return result;
        const attrInst = (ri.attribute_instance ?? []).find(a => a.uuid === attrUuid);
        if (!attrInst) return result;
        const attrMap = event.target as Y.Map<unknown>;
        if (attrMap.has('value')) {
            attrInst.value = attrMap.get('value') as string;
            result.changedAttributeInstances.push(attrInst);
        }
        return result;
    }

    // line_points Y.Array changed
    if (changedField === 'line_points') {
        const ri = sceneInstance.relationclasses_instances.find(r => r.uuid === relationClassInstanceUuid);
        if (!ri) return result;
        const lpArray = event.target as unknown as Y.Array<string>;
        ri.line_points = lpArray.toArray().map(s => JSON.parse(s));
        return result;
    }

    // coordinates_2d nested Y.Map changed
    if (changedField === 'coordinates_2d') {
        const coordMap = event.target as Y.Map<number>;
        const ri = sceneInstance.relationclasses_instances.find(r => r.uuid === relationClassInstanceUuid);
        if (ri && ri.coordinates_2d) {
            if (coordMap.has('x')) ri.coordinates_2d.x = coordMap.get('x')!;
            if (coordMap.has('y')) ri.coordinates_2d.y = coordMap.get('y')!;
            if (coordMap.has('z')) ri.coordinates_2d.z = coordMap.get('z')!;
        }
        return result;
    }

    // Scalar fields (name, description) directly on the relation class instance Y.Map
    if (path.length === 1 && changedField === undefined) {
        const ri = sceneInstance.relationclasses_instances.find(r => r.uuid === relationClassInstanceUuid);
        if (!ri) return result;
        const riMap = event.target as Y.Map<unknown>;
        (event as Y.YMapEvent<unknown>).changes.keys.forEach((_change, key) => {
            if (key === 'name') ri.name = riMap.get('name') as string;
            if (key === 'description') ri.description = riMap.get('description') as string;
        });
    }

    return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classInstanceToYMap(ci: ClassInstance): Y.Map<unknown> {
    const m = new Y.Map<unknown>();
    m.set('uuid', ci.uuid ?? '');
    m.set('uuid_class', ci.uuid_class ?? '');
    m.set('name', ci.name ?? '');
    m.set('description', ci.description ?? '');
    m.set('coordinates_2d', coordsToYMap(ci.coordinates_2d));
    m.set('rotation', rotationToYMap(ci.rotation));
    m.set('custom_variables', customVariablesToYMap(ci.custom_variables));
    m.set('attribute_instance', attrInstancesToYMap(ci.attribute_instance ?? []));
    return m;
}

function classInstanceFromYMap(yMap: Y.Map<unknown>): ClassInstance {
    const ci = new ClassInstance(
        yMap.get('uuid') as string,
        yMap.get('uuid_class') as string
    );
    ci.name = (yMap.get('name') as string) ?? '';
    ci.description = (yMap.get('description') as string) ?? '';
    const coordMap = yMap.get('coordinates_2d') as Y.Map<number>;
    ci.coordinates_2d = {
        x: coordMap?.get('x') ?? 0,
        y: coordMap?.get('y') ?? 0,
        z: coordMap?.get('z') ?? 0,
    };
    const rotMap = yMap.get('rotation') as Y.Map<number>;
    ci.rotation = {
        x: rotMap?.get('x') ?? 0,
        y: rotMap?.get('y') ?? 0,
        z: rotMap?.get('z') ?? 0,
        w: rotMap?.get('w') ?? 1,
    };
    ci.port_instance = [];
    const attrMap = yMap.get('attribute_instance') as Y.Map<Y.Map<unknown>>;
    ci.attribute_instance = [];
    if (attrMap) {
        attrMap.forEach((attrEntry) => {
            const ai = new AttributeInstance(
                attrEntry.get('uuid') as string,
                attrEntry.get('uuid_attribute') as string,
                null,
                ci.uuid,
                (attrEntry.get('value') as string) ?? ''
            );
            ai.name = (attrEntry.get('name') as string) ?? '';
            ci.attribute_instance.push(ai);
        });
    }
    return ci;
}

function relationClassInstanceToYMap(ri: RelationclassInstance): Y.Map<unknown> {
    const m = new Y.Map<unknown>();
    m.set('uuid', ri.uuid ?? '');
    m.set('uuid_class', ri.uuid_class ?? '');
    m.set('name', ri.name ?? '');
    m.set('description', ri.description ?? '');
    m.set('coordinates_2d', coordsToYMap(ri.coordinates_2d));
    m.set('rotation', rotationToYMap(ri.rotation));
    const linePoints = new Y.Array<string>();
    for (const lp of (ri as any).line_points ?? []) {
        linePoints.push([JSON.stringify(lp)]);
    }
    m.set('line_points', linePoints);
    m.set('attribute_instance', attrInstancesToYMap(ri.attribute_instance ?? []));
    // Include role instances so remote clients can reconstruct deletion-dependency info
    if (ri.role_instance_from) {
        m.set('role_instance_from', JSON.stringify(ri.role_instance_from));
    }
    if (ri.role_instance_to) {
        m.set('role_instance_to', JSON.stringify(ri.role_instance_to));
    }
    return m;
}

function relationClassInstanceFromYMap(yMap: Y.Map<unknown>): RelationclassInstance {
    const ri = new RelationclassInstance(
        yMap.get('uuid') as string,
        yMap.get('uuid_class') as string,
        undefined,
        undefined
    );
    ri.name = (yMap.get('name') as string) ?? '';
    ri.description = (yMap.get('description') as string) ?? '';
    const coordMap = yMap.get('coordinates_2d') as Y.Map<number>;
    ri.coordinates_2d = {
        x: coordMap?.get('x') ?? 0,
        y: coordMap?.get('y') ?? 0,
        z: coordMap?.get('z') ?? 0,
    };
    const lpArray = yMap.get('line_points') as unknown as Y.Array<string>;
    ri.line_points = lpArray ? lpArray.toArray().map(s => JSON.parse(s)) : [];
    const attrMap = yMap.get('attribute_instance') as Y.Map<Y.Map<unknown>>;
    ri.attribute_instance = [];
    if (attrMap) {
        attrMap.forEach((attrEntry) => {
            const ai = new AttributeInstance(
                attrEntry.get('uuid') as string,
                attrEntry.get('uuid_attribute') as string,
                null,
                ri.uuid,
                (attrEntry.get('value') as string) ?? ''
            );
            ai.name = (attrEntry.get('name') as string) ?? '';
            ri.attribute_instance.push(ai);
        });
    }
    // Reconstruct role instances (used for deletion cascading)
    const roleFromJson = yMap.get('role_instance_from') as string | undefined;
    if (roleFromJson) {
        try { ri.role_instance_from = JSON.parse(roleFromJson) as RoleInstance; } catch { /* ignore */ }
    }
    const roleToJson = yMap.get('role_instance_to') as string | undefined;
    if (roleToJson) {
        try { ri.role_instance_to = JSON.parse(roleToJson) as RoleInstance; } catch { /* ignore */ }
    }
    return ri;
}

function coordsToYMap(coords: { x: number; y: number; z: number } | undefined): Y.Map<number> {
    const m = new Y.Map<number>();
    m.set('x', coords?.x ?? 0);
    m.set('y', coords?.y ?? 0);
    m.set('z', coords?.z ?? 0);
    return m;
}

function rotationToYMap(rot: { x: number; y: number; z: number; w: number } | undefined): Y.Map<number> {
    const m = new Y.Map<number>();
    m.set('x', rot?.x ?? 0);
    m.set('y', rot?.y ?? 0);
    m.set('z', rot?.z ?? 0);
    m.set('w', rot?.w ?? 1);
    return m;
}

function customVariablesToYMap(vars: Record<string, unknown> | undefined): Y.Map<string> {
    const m = new Y.Map<string>();
    if (!vars) return m;
    for (const [k, v] of Object.entries(vars)) {
        m.set(k, JSON.stringify(v));
    }
    return m;
}

function attrInstancesToYMap(attrs: AttributeInstance[]): Y.Map<Y.Map<unknown>> {
    const m = new Y.Map<Y.Map<unknown>>();
    for (const attr of attrs) {
        const am = new Y.Map<unknown>();
        am.set('uuid', attr.uuid ?? '');
        am.set('uuid_attribute', attr.uuid_attribute ?? '');
        am.set('name', attr.name ?? '');
        am.set('value', attr.value ?? '');
        m.set(attr.uuid, am);
    }
    return m;
}
