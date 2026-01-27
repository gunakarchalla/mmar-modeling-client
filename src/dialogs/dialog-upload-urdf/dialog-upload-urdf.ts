import { EventAggregator } from 'aurelia';
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import { HybridAlgorithmsService } from 'resources/services/hybrid_algorithms_service';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import { MetaUtility } from 'resources/services/meta_utility';
import { InstanceCreationHandler } from 'resources/instance_creation_handler';
import { InstanceUtility } from 'resources/services/instance_utility';
import { PersistencyHandler } from 'resources/persistency_handler';
import { Logger } from 'resources/services/logger';
import { ClassInstance } from '../../../../mmar-global-data-structure';
import { UrdfPoseService } from 'resources/services/urdf_pose_service';
import * as THREE from 'three';
import URDFLoader, { URDFRobot, URDFLink, URDFJoint } from 'urdf-loader';
import * as unzipit from 'unzipit';

// Minimal shape of an unzipit entry we depend on.
// unzipit entries provide one or more of these read methods at runtime.
type ZipEntry = {
    text?: () => Promise<string>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
    blob?: () => Promise<Blob>;
};

type ZipIndex = {
    byPath: Map<string, ZipEntry>;
    byPathLower: Map<string, ZipEntry>;
    entries: Array<{ path: string; pathLower: string; baseNameLower: string; entry: ZipEntry }>;
};

export class DialogUploadUrdf {
    private uppy: Uppy | null = null;
    // Cache meshes discovered during a single import to avoid repeated entry reads.
    private meshCache = new Map<string, { format: 'gltf' | 'glb' | 'stl', data: string | ArrayBuffer, scale: number[] }>();

    constructor(
        private eventAggregator: EventAggregator,
        private metaUtility: MetaUtility,
        private instanceCreationHandler: InstanceCreationHandler,
        private instanceUtility: InstanceUtility,
        private persistencyHandler: PersistencyHandler,
        private logger: Logger,
        private urdfPoseService: UrdfPoseService,
        private hybridAlgorithmsService: HybridAlgorithmsService
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
        // Get selected file and directly process the zip in-memory.
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
            // Clear any previous import cache so this run only caches what it needs.
            this.meshCache.clear();

            // Parse the zip in-memory.
            const blob: Blob = file.data as Blob;

            const { entries } = await unzipit.unzip(blob);

            // Building a compact index so lookups don't scan repeatedly.
            // Note: unzipit exposes a plain object of entries keyed by path.
            const zipIndex = this.createZipIndex(entries as Record<string, ZipEntry>);

            // Clear selection after successful read
            this.uppy?.removeFile(file.id);

            // Discover a URDF file in the zip and instantiate links/joints.
            await this.processZipUrdf(zipIndex);
        } catch (e) {
            // Keep silent for now; can add user feedback/logging later
            this.logger?.log(`URDF upload failed: ${e?.message || e}`, 'error');
        } finally {
            // Ensure transient structures don't survive the import.
            // Note: mesh data referenced by created instances (urdfVizRep) stays alive as needed.
            this.meshCache.clear();
        }
    }

    private cleanup() {
        if (this.uppy) {
            this.uppy.destroy();
            this.uppy = null;
        }

        // Release any transient import cache when the dialog is closed.
        this.meshCache.clear();
    }

    // Parse the URDF from a zip using urdf-loader and instantiate Link/Joint classes.
    // Rendering stays delegated to PersistencyHandler + GraphicContext via urdfVizRep.
    private async processZipUrdf(zipIndex: ZipIndex) {
        try {
            const urdfEntry = this.findUrdfEntry(zipIndex);
            if (!urdfEntry) {
                this.logger?.log('No URDF file found in extracted archive', 'info');
                return;
            }

            const xmlText = await this.readEntryAsText(urdfEntry);

            // urdf-loader handles the XML parsing and builds a THREE.Object3D hierarchy for links/joints.
            // We disable automatic mesh loading because we want to:
            // 1) load meshes from the already-open zip in-memory, and
            // 2) reuse the existing GLTF/STL rendering path via GraphicContext in PersistencyHandler.
            const urdfLoader = new URDFLoader();
            urdfLoader.parseVisual = false;
            urdfLoader.parseCollision = false;

            let robot: URDFRobot;
            try {
                robot = urdfLoader.parse(xmlText);
            } catch (parseErr) {
                this.logger?.log(`Failed to parse URDF via urdf-loader: ${parseErr?.message || parseErr}`, 'error');
                return;
            }

            // Ensure world matrices are up to date so we can read absolute poses.
            // NOTE:
            // This project currently does not ship THREE.js type definitions, so the urdf-loader
            // classes don't appear to TypeScript as full THREE.Object3D instances.
            // At runtime they *are* Object3Ds, so we intentionally cast to `any` for pose reads.
            (robot as any).updateMatrixWorld?.(true);

            const getWorldPose = (obj: any) => {
                const pos = new THREE.Vector3();
                const rot = new THREE.Quaternion();

                if (obj && typeof obj.getWorldPosition === 'function') {
                    obj.getWorldPosition(pos);
                } else if (obj?.matrixWorld) {
                    pos.setFromMatrixPosition(obj.matrixWorld);
                }

                if (obj && typeof obj.getWorldQuaternion === 'function') {
                    obj.getWorldQuaternion(rot);
                } else if (obj?.matrixWorld) {
                    rot.setFromRotationMatrix(obj.matrixWorld);
                }

                return { pos, rot };
            };

            const links: URDFLink[] = Object.values(robot.links || {});
            const joints: URDFJoint[] = Object.values(robot.joints || {});

            // Key used to correlate later attribute edits with this robot instance.
            // We store it on each created class instance and also register it in UrdfPoseService.
            const robotKey = ((robot as any).urdfName as string) || ((robot as any).name as string) || 'robot';

            // Resolve the meta classes to instantiate for links/joints
            const sceneType = await this.metaUtility.getTabContextSceneType();
            if (!sceneType) {
                this.logger?.log('No scene type in current tab context', 'error');
                return;
            }
            const linkMeta = sceneType.classes.find(c => (c?.name || '').toLowerCase() === 'link');
            const jointMeta = sceneType.classes.find(c => (c?.name || '').toLowerCase() === 'joint');

            if (!linkMeta) this.logger?.log("No meta class named 'link' found in scene type", 'error');
            if (!jointMeta) this.logger?.log("No meta class named 'joint' found in scene type", 'error');

            // Keep URDF positions without aggressive scaling to avoid scattered links.
            // If you later want unit conversion (e.g., meters -> mm), this is the single switch.
            const scaleFactor = 1;
            const linkMap = new Map<string, ClassInstance>();

            // Track created instances so we can register name -> instance mappings for pose updates.
            const createdLinkInstances: ClassInstance[] = [];
            const createdJointInstances: ClassInstance[] = [];

            // Instantiate each link
            if (linkMeta && links.length) {
                for (const link of links) {
                    // Use `urdfName` from urdf-loader; avoid relying on THREE.Object3D.name typings.
                    const linkName = (link.urdfName || 'link');

                    // Use urdf-loader's computed scene graph transforms.
                    const { pos, rot } = getWorldPose(link as any);
                    pos.multiplyScalar(scaleFactor);

                    const classInstance = await this.instanceCreationHandler.createClassInstance(
                        this.instanceCreationHandler.create_UUID(),
                        pos.x, pos.y, pos.z,
                        linkMeta.uuid,
                        'class'
                    );
                    classInstance.rotation = rot;

                    // Store URDF linkage metadata for later pose recomputation on attribute edits.
                    (classInstance as any).urdfRobotKey = robotKey;
                    (classInstance as any).urdfRef = { kind: 'link', name: linkName };

                    linkMap.set(linkName, classInstance);
                    createdLinkInstances.push(classInstance);

                    // Set Name
                    await this.setSimpleAttribute(classInstance, 'Name', linkName);

                    // Attribute mapping reads from the underlying URDF DOM node stored by urdf-loader.

                    const linkNode = link.urdfNode;

                    // Set Inertial
                    const inertialEl = linkNode?.getElementsByTagName('inertial')[0];
                    if (inertialEl) {
                        const mass = inertialEl.getElementsByTagName('mass')[0]?.getAttribute('value') || '0';
                        const inertiaEl = inertialEl.getElementsByTagName('inertia')[0];
                        const originEl = inertialEl.getElementsByTagName('origin')[0];

                        const rowData: any = { 'Mass': mass };
                        if (originEl) Object.assign(rowData, { 'Origin': this.parseOriginToMap(originEl) });
                        if (inertiaEl) Object.assign(rowData, { 'Inertia': this.parseInertiaToMap(inertiaEl) });

                        await this.setTableAttribute(classInstance, 'Inertial', [rowData]);
                    }

                    // Set Visuals and capture mesh for rendering
                    const visualEls = Array.from(linkNode?.getElementsByTagName('visual') || []);
                    const visualRows = visualEls.map(v => {
                        const name = v.getAttribute('name') || '';
                        const origin = this.parseOriginToMap(v.getElementsByTagName('origin')[0]);
                        const geometry = this.parseGeometryToMap(v.getElementsByTagName('geometry')[0]);
                        const material = this.parseMaterialToMap(v.getElementsByTagName('material')[0]);
                        return { 'Name': name, 'Origin': origin, 'Geometry': geometry, 'Material': material };
                    });
                    if (visualRows.length > 0) await this.setTableAttribute(classInstance, 'Visual', visualRows);

                    // Attach URDF mesh to class instance (STL/GLTF)
                    // Try to pick up a referenced mesh (STL/GLTF) from the extracted archive for rendering
                    const meshInfo = await this.extractMeshFromVisuals(visualEls, zipIndex);
                    if (meshInfo) {
                        (classInstance as any).urdfVizRep = meshInfo;
                    }

                    // Set Collisions
                    const collisionEls = Array.from(linkNode?.getElementsByTagName('collision') || []);
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
            if (jointMeta && joints.length) {
                for (const joint of joints) {
                    // Use `urdfName` from urdf-loader; avoid relying on THREE.Object3D.name typings.
                    const jointName = (joint.urdfName || 'joint');
                    const jointType = joint.jointType || 'fixed';
                    const jointNode = joint.urdfNode;
                    const originElem = jointNode?.getElementsByTagName('origin')[0];

                    const { pos, rot } = getWorldPose(joint as any);
                    pos.multiplyScalar(scaleFactor);

                    const classInstance = await this.instanceCreationHandler.createClassInstance(
                        this.instanceCreationHandler.create_UUID(),
                        pos.x, pos.y, pos.z,
                        jointMeta.uuid,
                        'class'
                    );
                    classInstance.rotation = rot;

                    // Store URDF linkage metadata for later pose recomputation on attribute edits.
                    (classInstance as any).urdfRobotKey = robotKey;
                    (classInstance as any).urdfRef = { kind: 'joint', name: jointName };

                    createdJointInstances.push(classInstance);

                    await this.setSimpleAttribute(classInstance, 'Name', jointName);
                    // Map URDF type to Metamodel Type (Capitalized)

                    await this.setSimpleAttribute(classInstance, 'Type', jointType || 'Fixed');

                    // Origin
                    if (originElem) {
                        await this.setTableAttribute(classInstance, 'Origin', [this.parseOriginToMap(originElem)]);
                    }

                    // Axis
                    // Prefer parsed axis from urdf-loader (already numeric), fallback to XML if missing.
                    if (joint.axis) {
                        await this.setTableAttribute(classInstance, 'Axis', [{ 'Position x': String(joint.axis.x), 'Position y': String(joint.axis.y), 'Position z': String(joint.axis.z) }]);
                    } else {
                        const axisElem = jointNode?.getElementsByTagName('axis')[0];
                        if (axisElem) {
                            const xyz = (axisElem.getAttribute('xyz') || '0 0 1').split(/\s+/);
                            await this.setTableAttribute(classInstance, 'Axis', [{ 'Position x': xyz[0], 'Position y': xyz[1], 'Position z': xyz[2] }]);
                        }
                    }

                    // Limit
                    // urdf-loader exposes lower/upper; we keep effort/velocity from the raw node for completeness.
                    const limitElem = jointNode?.getElementsByTagName('limit')[0];
                    if (limitElem || joint.limit) {
                        const limitData = {
                            'Lower': limitElem?.getAttribute('lower') || (joint.limit?.lower != null ? String(joint.limit.lower) : '0'),
                            'Upper': limitElem?.getAttribute('upper') || (joint.limit?.upper != null ? String(joint.limit.upper) : '0'),
                            'Effort': limitElem?.getAttribute('effort') || '0',
                            'Velocity': limitElem?.getAttribute('velocity') || '0'
                        };
                        await this.setTableAttribute(classInstance, 'Limit', [limitData]);
                    }

                    // Child Link Reference
                    const childLinkName = jointNode?.getElementsByTagName('child')[0]?.getAttribute('link');
                    if (childLinkName && linkMap.has(childLinkName)) {
                        const childInstance = linkMap.get(childLinkName);
                        await this.setReferenceAttribute(classInstance, 'Child link', childInstance);
                    }

                    // Parent Link Reference
                    const parentLinkName = jointNode?.getElementsByTagName('parent')[0]?.getAttribute('link');
                    if (parentLinkName && linkMap.has(parentLinkName)) {
                        const parentInstance = linkMap.get(parentLinkName);
                        await this.setReferenceAttribute(classInstance, 'Parent link', parentInstance);
                    }
                }
            }

            // Register the parsed robot + instance mapping so table-attribute edits can recompute poses.
            // This is intentionally done after all instances are created.
            this.urdfPoseService.registerRobot(robotKey, robot, scaleFactor, createdLinkInstances, createdJointInstances);

            // Draw newly created instances if not yet in scene
            await this.persistencyHandler.checkIfClassinstanceInScene();

        } catch (err) {
            this.logger?.log(`URDF processing error: ${err?.message || err}`, 'error');
            console.error(err);
        }
    }

    // **************Helper Functions***************************** //

    // To normalize zip paths for consistent lookup. Uses forward slashes and trims leading ./ or /
    private normalizeZipPath(path: string) {
        // unzipit keys are path-like, but we normalize to be robust across zippers.
        return String(path).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
    }

    // Build a compact index of zip entries for efficient lookup by path or base name. Used during URDF processing.
    private createZipIndex(entries: Record<string, ZipEntry>): ZipIndex {
        const byPath = new Map<string, ZipEntry>();
        const byPathLower = new Map<string, ZipEntry>();
        const list: ZipIndex['entries'] = [];

        for (const [name, entry] of Object.entries(entries || {})) {
            const normalized = this.normalizeZipPath(name);
            if (!normalized || normalized.endsWith('/')) {
                continue;
            }

            const pathLower = normalized.toLowerCase();
            const baseNameLower = (normalized.split('/').pop() || '').toLowerCase();

            byPath.set(normalized, entry);
            byPathLower.set(pathLower, entry);
            list.push({ path: normalized, pathLower, baseNameLower, entry });
        }

        return { byPath, byPathLower, entries: list };
    }

    // Find a URDF file entry in the zip index. 
    private findUrdfEntry(zipIndex: ZipIndex) {
        // Prefer URDFs inside a directory named 'urdf'; fallback to first *.urdf anywhere in archive.
        let fallback: ZipEntry | null = null;

        for (const item of zipIndex.entries) {
            if (!item.baseNameLower.endsWith('.urdf')) continue;
            if (item.pathLower.includes('/urdf/')) {
                return item.entry;
            }
            if (!fallback) fallback = item.entry;
        }

        return fallback;
    }

    // Read a zip entry as text, using available methods. Used for URDF XML and GLTF JSON.
    private async readEntryAsText(entry: ZipEntry): Promise<string> {
        // unzipit entry supports .text(); fallback via Blob if needed.
        if (entry && typeof entry.text === 'function') {
            return await entry.text();
        }

        if (entry && typeof entry.blob === 'function') {
            const b = await entry.blob();
            return await b.text();
        }

        throw new Error('Zip entry cannot be read as text');
    }

    // Read a zip entry as ArrayBuffer, using available methods. Used for binary mesh data.
    private async readEntryAsArrayBuffer(entry: ZipEntry): Promise<ArrayBuffer> {
        // unzipit entry supports .arrayBuffer(); fallback via Blob if needed.
        if (entry && typeof entry.arrayBuffer === 'function') {
            return await entry.arrayBuffer();
        }

        if (entry && typeof entry.blob === 'function') {
            const b = await entry.blob();
            return await b.arrayBuffer();
        }

        throw new Error('Zip entry cannot be read as ArrayBuffer');
    }

    // Parse an <origin> element into a flat map for table attribute setting.
    private parseOriginToMap(originElem: Element | undefined) {
        if (!originElem) return {};
        const xyz = (originElem.getAttribute('xyz') || '0 0 0').split(/\s+/);
        const rpy = (originElem.getAttribute('rpy') || '0 0 0').split(/\s+/);
        return {
            'Position x': xyz[0], 'Position y': xyz[1], 'Position z': xyz[2],
            'Roll': rpy[0], 'Pitch': rpy[1], 'Yaw': rpy[2]
        };
    }

    // Parse an <inertia> element into a flat map for table attribute setting.
    private parseInertiaToMap(inertiaElem: Element | undefined) {
        if (!inertiaElem) return {};
        const attrs = ['ixx', 'ixy', 'ixz', 'iyy', 'iyz', 'izz'];
        const res: any = {};
        attrs.forEach(a => res[a.charAt(0).toUpperCase() + a.slice(1)] = inertiaElem.getAttribute(a) || '0');
        return res;
    }

    // Parse a <geometry> element into a flat map for table attribute setting.
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

    // Parse a <material> element into a flat map for table attribute setting.
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

    // Parse a scale attribute string into an array of three numbers.
    private parseScaleAttr(scaleAttr?: string | null): number[] {
        if (!scaleAttr) return [1, 1, 1];
        const parts = scaleAttr.trim().split(/\s+/).map(v => parseFloat(v));
        if (parts.length === 3 && parts.every(v => !isNaN(v))) {
            return parts;
        }
        return [1, 1, 1];
    }

    // Normalize a mesh filename from URDF (e.g., package://path/to/mesh) to a zip-relative path.
    private normalizeMeshPath(filename: string) {
        return filename.replace(/^package:\/\//i, '').replace(/^\//, '');
    }

    // Load a mesh file from the in-memory zip entries and normalize output shape for GLTF/GLB/STL
    private async loadMeshData(zipIndex: ZipIndex, filename: string, scaleAttr?: string | null) {
        const normalized = this.normalizeMeshPath(filename);
        const cacheKey = `${normalized}|${scaleAttr || ''}`;
        if (this.meshCache.has(cacheKey)) {
            return this.meshCache.get(cacheKey);
        }

        // Resolve by path first, then fallback by base name search.
        const normalizedKey = this.normalizeZipPath(normalized);
        const direct = zipIndex.byPath.get(normalizedKey) || zipIndex.byPathLower.get(normalizedKey.toLowerCase());

        let entry = direct;
        if (!entry) {
            const baseNameLower = (normalizedKey.split('/').pop() || '').toLowerCase();
            // Fallback scan: match by base name to tolerate archives that contain different top-level folders.
            entry = zipIndex.entries.find(e => e.baseNameLower === baseNameLower)?.entry;
        }
        if (!entry) return null;

        const ext = (normalizedKey || filename).toLowerCase().split('.').pop();
        const format = ext === 'stl' ? 'stl' : ext === 'glb' ? 'glb' : 'gltf';

        let data: string | ArrayBuffer;
        if (format === 'gltf') {
            data = await this.readEntryAsText(entry);
        } else {
            data = await this.readEntryAsArrayBuffer(entry);
        }

        const scale = this.parseScaleAttr(scaleAttr);
        const meshInfo = { format, data, scale } as const;
        this.meshCache.set(cacheKey, meshInfo);
        return meshInfo;
    }

    // Walk visual tags to find the first usable mesh reference
    private async extractMeshFromVisuals(visualEls: Element[], zipIndex: ZipIndex) {
        for (const visual of visualEls) {
            const meshEl = visual.getElementsByTagName('mesh')[0];
            if (!meshEl) continue;
            const filename = meshEl.getAttribute('filename');
            if (!filename) continue;
            const scaleAttr = meshEl.getAttribute('scale');
            const meshData = await this.loadMeshData(zipIndex, filename, scaleAttr);
            if (meshData) {
                return meshData;
            }
        }
        return null;
    }

    // Set a simple (non-table, non-reference) attribute value on a class instance.
    private async setSimpleAttribute(classInstance: ClassInstance, attrName: string, value: string) {
        const attrInst = await this.instanceUtility.getAttributeInstanceFromClassInstance(attrName, classInstance.uuid, "name");
        if (attrInst) attrInst.value = value;
    }

    // Set a table attribute value on a class instance from an array of row data maps.
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

    // Set a reference attribute on a class instance pointing to a target instance.
    private async setReferenceAttribute(classInstance: ClassInstance, attrName: string, targetInstance: ClassInstance) {
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

        roleInstance.name = targetInstance.attribute_instance.filter(ai => ai.name === 'Name')[0]?.value || targetInstance.name;

        attrInst.role_instance_from = roleInstance;

        attrInst.value = targetInstance.name;

        //run hybrid algorithm for Statechange -> reference
        await this.hybridAlgorithmsService.checkHybridAlgorithms(attrInst);
    }
}
