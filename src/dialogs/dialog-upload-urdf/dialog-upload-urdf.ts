import { EventAggregator } from 'aurelia';
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';

import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
// import 'unzipit' as unzipit;
import { MetaUtility } from 'resources/services/meta_utility';
import { InstanceCreationHandler } from 'resources/instance_creation_handler';
import { InstanceUtility } from 'resources/services/instance_utility';
import { PersistencyHandler } from 'resources/persistency_handler';
import { Logger } from 'resources/services/logger';
import { AttributeInstance, ClassInstance, RoleInstance, RelationclassInstance, Class, Relationclass, Attribute } from '../../../../mmar-global-data-structure';
import { GlobalDefinition } from 'resources/global_definitions';
import { GlobalRelationclassObject } from 'resources/global_relationclass_object';

export class DialogUploadUrdf {
    private uppy: Uppy | null = null;

    constructor(
        private eventAggregator: EventAggregator,
        private metaUtility: MetaUtility,
        private instanceCreationHandler: InstanceCreationHandler,
        private instanceUtility: InstanceUtility,
        private persistencyHandler: PersistencyHandler,
        private logger: Logger,
        private globalObjectInstance: GlobalDefinition,
        private globalRelationclassObject: GlobalRelationclassObject
    ) {
        this.eventAggregator.subscribe('openDialogUploadUrdf', async () => {
            await this.open();
        });
    }

    async open() {
        // initialize Uppy with single .zip restriction
        this.cleanup();
        this.uppy = new Uppy({
            restrictions: {
                maxNumberOfFiles: 1,
                allowedFileTypes: ['.zip']
            }
        });
        this.uppy.use(Dashboard, {
            inline: true,
            replaceTargetContent: true,
            target: '#dragdropUrdf',
            hideUploadButton: true,
            showProgressDetails: true,
            width: '100%',
            height: '200px'
        });
    }

    async attached() {
        // ensure uppy exists if dialog mounted without event
        if (!this.uppy) {
            await this.open();
        }
    }

    async detaching() {
        this.cleanup();
    }

    async upload() {
        // Get selected file and extract to Origin Private File System (OPFS)
        const files = this.uppy?.getFiles ? this.uppy.getFiles() : [];
        if (!files || files.length === 0) {
            return;
        }

        const file = files[0];
        // ensure it's a .zip by name or type
        const isZip = (file.type === 'application/zip') || (file.extension === 'zip') || (file.name?.toLowerCase().endsWith('.zip'));
        if (!isZip) {
            // ignore non-zip files silently for now; could add UI feedback later
            return;
        }

        try {
            // Parse the zip without loading entire archive into memory
            const blob: Blob = file.data as Blob;
            const unzipit: any = await import('unzipit');
            const { entries } = await unzipit.unzip(blob);

            // Create a root folder in OPFS for URDFs, namespaced by zip filename
            const opfsRoot: any = await (navigator as any).storage.getDirectory();
            const urdfRoot = await opfsRoot.getDirectoryHandle('urdf', { create: true });
            const zipBaseName = (file.name || 'archive').replace(/\.zip$/i, '');
            const targetRoot = await urdfRoot.getDirectoryHandle(zipBaseName, { create: true });

            // Utility to ensure directory path exists
            const ensureDir = async (dirHandle: FileSystemDirectoryHandle, parts: string[]) => {
                let current = dirHandle;
                for (const part of parts) {
                    if (!part || part === '.') continue;
                    current = await current.getDirectoryHandle(part, { create: true });
                }
                return current;
            };

            // Iterate entries and write to OPFS, preserving folder structure
            for (const [name, entry] of Object.entries(entries)) {
                const normalizedName = name.replace(/\\/g, '/');
                // Skip directory placeholders; we'll create dirs on demand
                if (normalizedName.endsWith('/')) {
                    await ensureDir(targetRoot, normalizedName.replace(/\/$/, '').split('/'));
                    continue;
                }

                const parts = normalizedName.split('/');
                const fileName = parts.pop();
                if (!fileName) continue;
                const dir = await ensureDir(targetRoot, parts);

                const fileHandle = await dir.getFileHandle(fileName, { create: true });
                const writable = await (fileHandle as any).createWritable();
                // Use Blob path to avoid large JS heap allocations where possible
                const blob = await (entry as any).blob();
                await writable.write(blob);
                await writable.close();
            }
            // Clear selection after successful extraction
            this.uppy?.removeFile(file.id);
            this.uppy.removeFile(file.id);

            // After extraction, discover a URDF file and instantiate links
            await this.processExtractedUrdf(targetRoot);
        } catch (e) {
            // Keep silent for now; can add user feedback/logging later
        }
    }

    private cleanup() {
        if (this.uppy) {
            this.uppy.destroy();
            this.uppy = null;
        }
    }

    // Recursively search for a folder named "urdf" and return the first *.urdf file handle found.
    private async processExtractedUrdf(rootDir: any) {
        try {
            const urdfFileHandle = await this.findUrdfFile(rootDir);
            if (!urdfFileHandle) {
                this.logger?.log('No URDF file found in extracted archive', 'info');
                return;
            }

            const urdfFile = await urdfFileHandle.getFile();
            const xmlText = await urdfFile.text();

            const dom = new DOMParser().parseFromString(xmlText, 'application/xml');
            const parserError = dom.getElementsByTagName('parsererror')[0];
            if (parserError) {
                this.logger?.log('Failed to parse URDF XML', 'error');
                return;
            }

            const linkElements = Array.from(dom.getElementsByTagName('link'));
            const jointElements = Array.from(dom.getElementsByTagName('joint'));

            // Resolve the meta classes to instantiate for links/joints
            const sceneType = await this.metaUtility.getTabContextSceneType();
            if (!sceneType) {
                this.logger?.log('No scene type in current tab context', 'error');
                return;
            }
            const linkMeta = sceneType.classes.find(c => (c?.name || '').toLowerCase() === 'link');
            const jointMeta = sceneType.classes.find(c => (c?.name || '').toLowerCase() === 'joint');
            const hasRelationMeta = sceneType.relationclasses.find(r => (r?.name || '').toLowerCase() === 'has');

            if (!linkMeta) this.logger?.log("No meta class named 'link' found in scene type", 'error');
            if (!jointMeta) this.logger?.log("No meta class named 'joint' found in scene type", 'error');
            if (!hasRelationMeta) this.logger?.log("No meta relation class named 'has' found in scene type", 'error');

            const scaleFactor = 100;
            const linkMap = new Map<string, ClassInstance>();

            // Instantiate each link
            if (linkMeta && linkElements.length) {
                for (const el of linkElements) {
                    const linkName = el.getAttribute('name') || 'link';

                    // Determine position from inertial origin or visual origin or default
                    let originElem = this.findOrigin(el, 'inertial') || this.findOrigin(el, 'visual') || this.findOrigin(el);
                    const { x, y, z } = this.parseOrigin(originElem, scaleFactor);

                    const classInstance = await this.instanceCreationHandler.createClassInstance(
                        this.instanceCreationHandler.create_UUID(),
                        x, y, z,
                        linkMeta.uuid,
                        'class'
                    );
                    linkMap.set(linkName, classInstance);

                    // Set Name
                    await this.setSimpleAttribute(classInstance, 'Name', linkName);

                    // Set Inertial
                    const inertialEl = el.getElementsByTagName('inertial')[0];
                    if (inertialEl) {
                        const mass = inertialEl.getElementsByTagName('mass')[0]?.getAttribute('value') || '0';
                        const inertiaEl = inertialEl.getElementsByTagName('inertia')[0];
                        const originEl = inertialEl.getElementsByTagName('origin')[0];

                        const rowData: any = { 'Mass': mass };
                        if (originEl) Object.assign(rowData, { 'Origin': this.parseOriginToMap(originEl) });
                        if (inertiaEl) Object.assign(rowData, { 'Inertia': this.parseInertiaToMap(inertiaEl) });

                        await this.setTableAttribute(classInstance, 'Inertial', [rowData]);
                    }

                    // Set Visuals
                    const visualEls = Array.from(el.getElementsByTagName('visual'));
                    const visualRows = visualEls.map(v => {
                        const name = v.getAttribute('name') || '';
                        const origin = this.parseOriginToMap(v.getElementsByTagName('origin')[0]);
                        const geometry = this.parseGeometryToMap(v.getElementsByTagName('geometry')[0]);
                        const material = this.parseMaterialToMap(v.getElementsByTagName('material')[0]);
                        return { 'Name': name, 'Origin': origin, 'Geometry': geometry, 'Material': material };
                    });
                    if (visualRows.length > 0) await this.setTableAttribute(classInstance, 'Visual', visualRows);

                    // Set Collisions
                    const collisionEls = Array.from(el.getElementsByTagName('collision'));
                    const collisionRows = collisionEls.map(c => {
                        const name = c.getAttribute('name') || '';
                        const origin = this.parseOriginToMap(c.getElementsByTagName('origin')[0]);
                        const geometry = this.parseGeometryToMap(c.getElementsByTagName('geometry')[0]);
                        return { 'Name': name, 'Origin': origin, 'Geometry': geometry };
                    });
                    if (collisionRows.length > 0) await this.setTableAttribute(classInstance, 'Collision', collisionRows);
                }
            }

            // Instantiate each joint
            if (jointMeta && jointElements.length) {
                for (const el of jointElements) {
                    const jointName = el.getAttribute('name') || 'joint';
                    const jointType = el.getAttribute('type') || 'fixed';
                    const originElem = el.getElementsByTagName('origin')[0];
                    const { x, y, z } = this.parseOrigin(originElem, scaleFactor);

                    const classInstance = await this.instanceCreationHandler.createClassInstance(
                        this.instanceCreationHandler.create_UUID(),
                        x, y, z,
                        jointMeta.uuid,
                        'class'
                    );

                    await this.setSimpleAttribute(classInstance, 'Name', jointName);
                    // Map URDF type to Metamodel Type (Capitalized)
                    const typeMap: any = { 'revolute': 'Revolute', 'continuous': 'Continuous', 'prismatic': 'Prismatic', 'fixed': 'Fixed', 'floating': 'Floating', 'planar': 'Planar' };
                    await this.setSimpleAttribute(classInstance, 'Type', typeMap[jointType] || 'Fixed');

                    // Origin
                    if (originElem) {
                        await this.setTableAttribute(classInstance, 'Origin', [this.parseOriginToMap(originElem)]);
                    }

                    // Axis
                    const axisElem = el.getElementsByTagName('axis')[0];
                    if (axisElem) {
                        const xyz = (axisElem.getAttribute('xyz') || '0 0 1').split(/\s+/);
                        await this.setTableAttribute(classInstance, 'Axis', [{ 'Position x': xyz[0], 'Position y': xyz[1], 'Position z': xyz[2] }]);
                    }

                    // Limit
                    const limitElem = el.getElementsByTagName('limit')[0];
                    if (limitElem) {
                        const limitData = {
                            'Lower': limitElem.getAttribute('lower') || '0',
                            'Upper': limitElem.getAttribute('upper') || '0',
                            'Effort': limitElem.getAttribute('effort') || '0',
                            'Velocity': limitElem.getAttribute('velocity') || '0'
                        };
                        await this.setTableAttribute(classInstance, 'Limit', [limitData]);
                    }

                    // Child Link Reference
                    const childLinkName = el.getElementsByTagName('child')[0]?.getAttribute('link');
                    if (childLinkName && linkMap.has(childLinkName)) {
                        const childInstance = linkMap.get(childLinkName);
                        await this.setReferenceAttribute(classInstance, 'Child link', childInstance, 'classInstance');
                    }

                    // Parent Link Relation
                    const parentLinkName = el.getElementsByTagName('parent')[0]?.getAttribute('link');
                    if (parentLinkName && linkMap.has(parentLinkName) && hasRelationMeta) {
                        const parentInstance = linkMap.get(parentLinkName);
                        await this.createRelation(hasRelationMeta, parentInstance, classInstance);
                    }
                }
            }

            // Draw newly created instances if not yet in scene
            await this.persistencyHandler.checkIfClassinstanceInScene();

        } catch (err) {
            this.logger?.log(`URDF processing error: ${err?.message || err}`, 'error');
            console.error(err);
        }
    }

    // Helpers
    private findOrigin(el: Element, tagName?: string): Element | undefined {
        if (tagName) {
            const tag = el.getElementsByTagName(tagName)[0];
            return tag ? tag.getElementsByTagName('origin')[0] : undefined;
        }
        return el.getElementsByTagName('origin')[0];
    }

    private parseOrigin(originElem: Element | undefined, scaleFactor: number) {
        let coords = { x: 0, y: 0, z: 0 };
        if (!originElem) return coords;
        const xyzAttr = originElem.getAttribute('xyz');
        if (!xyzAttr) return coords;
        const parts = xyzAttr.trim().split(/\s+/).map(v => parseFloat(v));
        if (parts.length >= 3 && parts.every(n => !isNaN(n))) {
            coords = { x: parts[0] * scaleFactor, y: parts[1] * scaleFactor, z: parts[2] * scaleFactor };
        }
        return coords;
    }

    private parseOriginToMap(originElem: Element | undefined) {
        if (!originElem) return {};
        const xyz = (originElem.getAttribute('xyz') || '0 0 0').split(/\s+/);
        const rpy = (originElem.getAttribute('rpy') || '0 0 0').split(/\s+/);
        return {
            'Position x': xyz[0], 'Position y': xyz[1], 'Position z': xyz[2],
            'Roll': rpy[0], 'Pitch': rpy[1], 'Yaw': rpy[2]
        };
    }

    private parseInertiaToMap(inertiaElem: Element | undefined) {
        if (!inertiaElem) return {};
        const attrs = ['ixx', 'ixy', 'ixz', 'iyy', 'iyz', 'izz'];
        const res: any = {};
        attrs.forEach(a => res[a.charAt(0).toUpperCase() + a.slice(1)] = inertiaElem.getAttribute(a) || '0');
        return res;
    }

    private parseGeometryToMap(geoElem: Element | undefined) {
        if (!geoElem) return {};
        const box = geoElem.getElementsByTagName('box')[0];
        const cylinder = geoElem.getElementsByTagName('cylinder')[0];
        const sphere = geoElem.getElementsByTagName('sphere')[0];
        const mesh = geoElem.getElementsByTagName('mesh')[0];

        if (box) return { 'Geometry box': box.getAttribute('size') || '' };
        if (cylinder) return { 'Geometry cylinder': `${cylinder.getAttribute('radius') || ''} ${cylinder.getAttribute('length') || ''}` };
        if (sphere) return { 'Geometry sphere': sphere.getAttribute('radius') || '' };
        if (mesh) return { 'Geometry mesh': mesh.getAttribute('filename') || '' };
        return {};
    }

    private parseMaterialToMap(matElem: Element | undefined) {
        if (!matElem) return {};
        const name = matElem.getAttribute('name') || '';
        const colorEl = matElem.getElementsByTagName('color')[0];
        const textureEl = matElem.getElementsByTagName('texture')[0];

        let color = '';
        if (colorEl) {
            const rgba = (colorEl.getAttribute('rgba') || '').split(/\s+/).map(Number);
            if (rgba.length >= 3) {
                // Convert to Hex
                const toHex = (n: number) => {
                    const hex = Math.floor(n * 255).toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                };
                color = '#' + toHex(rgba[0]) + toHex(rgba[1]) + toHex(rgba[2]);
            }
        }

        return { 'Name': name, 'Color': color, 'Texture': textureEl?.getAttribute('filename') || '' };
    }

    private async setSimpleAttribute(classInstance: ClassInstance, attrName: string, value: string) {
        const attrInst = await this.instanceUtility.getAttributeInstanceFromClassInstance(attrName, classInstance.uuid, "name");
        if (attrInst) attrInst.value = value;
    }

    private async setTableAttribute(classInstance: ClassInstance, attrName: string, rows: any[]) {
        const parentAttrInst = await this.instanceUtility.getAttributeInstanceFromClassInstance(attrName, classInstance.uuid, "name");
        if (!parentAttrInst) return;

        // Get the attribute definition to know columns
        const parentAttrDef = (await this.metaUtility.getMetaClass(classInstance.uuid_class)).attributes.find(a => a.uuid === parentAttrInst.uuid_attribute);
        if (!parentAttrDef) return;

        const columns = parentAttrDef.attribute_type.has_table_attribute;
        if (!columns || columns.length === 0) return;

        // Clear existing rows if any (optional, but safer for clean import)
        parentAttrInst.table_attributes = [];

        for (const rowData of rows) {
            for (const col of columns) {
                const colAttr = col.attribute;
                const colName = colAttr.name;
                const val = rowData[colName];

                // If value is object, it's a nested table (e.g. Origin inside Visual)
                if (typeof val === 'object' && val !== null) {
                    const cellInst = await this.instanceCreationHandler.createAttributeInstance(
                        colAttr, null, null, "", null, null, null, null, parentAttrDef.uuid, null
                    );

                    const cellAttrDef = colAttr;
                    const cellColumns = cellAttrDef.attribute_type.has_table_attribute;

                    if (cellColumns && cellColumns.length > 0) {
                        cellInst.table_attributes = [];
                        const nestedRowData = val;

                        for (const nestedCol of cellColumns) {
                            const nestedColAttr = nestedCol.attribute;
                            const nestedVal = nestedRowData[nestedColAttr.name] || nestedColAttr.default_value || '';

                            const nestedCellInst = await this.instanceCreationHandler.createAttributeInstance(
                                nestedColAttr, null, null, nestedVal, null, null, null, null, colAttr.uuid, null
                            );
                            cellInst.table_attributes.push(nestedCellInst);
                        }
                    }
                    parentAttrInst.table_attributes.push(cellInst);

                } else {
                    // Simple value
                    const cellInst = await this.instanceCreationHandler.createAttributeInstance(
                        colAttr, null, null, val || colAttr.default_value || '', null, null, null, null, parentAttrDef.uuid, null
                    );
                    parentAttrInst.table_attributes.push(cellInst);
                }
            }
        }
    }

    private async setReferenceAttribute(classInstance: ClassInstance, attrName: string, targetInstance: ClassInstance, targetType: string) {
        const attrInst = await this.instanceUtility.getAttributeInstanceFromClassInstance(attrName, classInstance.uuid, "name");
        if (!attrInst) return;

        // Create RoleInstance
        // We need parent role UUID. 
        const classDef = await this.metaUtility.getMetaClass(classInstance.uuid_class);
        const attrDef = classDef.attributes.find(a => a.uuid === attrInst.uuid_attribute);
        const parentRole = attrDef?.attribute_type.role;

        if (!parentRole) return;

        const roleInstance = await this.instanceCreationHandler.createRoleInstance(
            this.instanceCreationHandler.create_UUID(),
            targetInstance, null, 'attribute_reference', null, targetInstance.name, parentRole.uuid
        );

        attrInst.role_instance_from = roleInstance;
        attrInst.value = targetInstance.name;
    }

    private async createRelation(relationMeta: Relationclass, fromInstance: ClassInstance, toInstance: ClassInstance) {
        // Create Relation Instance
        const x = (fromInstance.coordinates_2d.x + toInstance.coordinates_2d.x) / 2;
        const y = (fromInstance.coordinates_2d.y + toInstance.coordinates_2d.y) / 2;
        const z = (fromInstance.coordinates_2d.z + toInstance.coordinates_2d.z) / 2;

        const relationInstance = await this.instanceCreationHandler.createRelationclassInstance(
            this.instanceCreationHandler.create_UUID(),
            x, y, z,
            relationMeta.uuid,
            'relation'
        );

        // Create Role Instances
        const roleFrom = await this.instanceCreationHandler.createRoleInstance(
            this.instanceCreationHandler.create_UUID(),
            fromInstance, null, 'from', relationInstance.uuid
        );

        const roleTo = await this.instanceCreationHandler.createRoleInstance(
            this.instanceCreationHandler.create_UUID(),
            toInstance, null, 'to', relationInstance.uuid
        );
    }

    private async findUrdfFile(dirHandle: any): Promise<any | null> {
        // Prefer files inside a directory named 'urdf'; fallback to first *.urdf anywhere under root
        const queue: Array<{ handle: any, path: string }> = [{ handle: dirHandle, path: '' }];
        let fallback: any = null;

        while (queue.length > 0) {
            const { handle, path } = queue.shift();
            // Collect entries
            // entries(): AsyncIterable<[name, handle]> is not typed in TS DOM lib for OPFS yet
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for await (const [name, child] of (handle as any).entries()) {
                const childPath = path ? `${path}/${name}` : name;
                if (child.kind === 'file' && name.toLowerCase().endsWith('.urdf')) {
                    // If inside an 'urdf' directory, return immediately
                    if (childPath.toLowerCase().includes('/urdf/')) {
                        return child;
                    }
                    // Else keep as fallback if none chosen yet
                    if (!fallback) fallback = child;
                } else if (child.kind === 'directory') {
                    queue.push({ handle: child, path: childPath });
                }
            }
        }

        return fallback;
    }
}
