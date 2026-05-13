import * as Y from 'yjs';
import * as THREE from 'three';
import { SceneInstance, ClassInstance, AttributeInstance } from '../../../../mmar-global-data-structure';
import { GlobalDefinition } from '../global_definitions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalChangeType =
    | { type: 'coordinates'; classInstanceUuid: string; x: number; y: number; z: number }
    | { type: 'rotation'; classInstanceUuid: string; x: number; y: number; z: number; w: number }
    | { type: 'attribute_value'; classInstanceUuid: string; attributeUuid: string; value: string }
    | { type: 'add_class_instance'; classInstance: ClassInstance }
    | { type: 'remove_class_instance'; classInstanceUuid: string };

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
            const riMap = new Y.Map<unknown>();
            riMap.set('uuid', ri.uuid ?? '');
            riMap.set('uuid_class', ri.uuid_class ?? '');
            riMap.set('name', ri.name ?? '');
            riMap.set('description', ri.description ?? '');
            riMap.set('coordinates_2d', coordsToYMap(ri.coordinates_2d));
            riMap.set('rotation', rotationToYMap(ri.rotation));
            const linePoints = new Y.Array<string>();
            for (const lp of (ri as any).line_points ?? []) {
                linePoints.push([JSON.stringify(lp)]);
            }
            riMap.set('line_points', linePoints);
            riMap.set('attribute_instance', attrInstancesToYMap(ri.attribute_instance ?? []));
            relInstances.set(ri.uuid, riMap);
        }

        // role_instances, attribute_instances, port_instances (stored as JSON blobs —
        // these are not typically edited concurrently so a string representation is fine)
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
): void {
    const path = event.path as Array<string | number>;

    // Path is relative to the 'class_instances' Y.Map (the observeDeep root).
    if (path.length === 0) {
        // Add / delete entries at the class_instances level
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
            }
            // 'add' case: full re-render would be needed — deferred to later phases
        });
        return;
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
        return;
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
        return;
    }

    // attribute_instance Y.Map: a specific attribute entry changed
    if (path.length >= 3 && changedField === 'attribute_instance') {
        const attrUuid = path[2] as string;
        const ci = sceneInstance.class_instances.find(c => c.uuid === classInstanceUuid);
        if (!ci) return;
        const attrInst = ci.attribute_instance.find(a => a.uuid === attrUuid);
        if (!attrInst) return;
        const attrMap = event.target as Y.Map<unknown>;
        if (attrMap.has('value')) {
            attrInst.value = attrMap.get('value') as string;
        }
        return;
    }

    // Scalar fields directly on the class instance Y.Map (name, description, etc.)
    if (path.length === 1 && changedField === undefined) {
        const ci = sceneInstance.class_instances.find(c => c.uuid === classInstanceUuid);
        if (!ci) return;
        const ciMap = event.target as Y.Map<unknown>;
        (event as Y.YMapEvent<unknown>).changes.keys.forEach((_change, key) => {
            if (key === 'name') ci.name = ciMap.get('name') as string;
            if (key === 'description') ci.description = ciMap.get('description') as string;
        });
    }
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
