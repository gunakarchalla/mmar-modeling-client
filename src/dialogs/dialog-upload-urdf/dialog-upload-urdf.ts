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

export class DialogUploadUrdf {
    private uppy: Uppy | null = null;

    constructor(
        private eventAggregator: EventAggregator,
        private metaUtility: MetaUtility,
        private instanceCreationHandler: InstanceCreationHandler,
        private instanceUtility: InstanceUtility,
        private persistencyHandler: PersistencyHandler,
        private logger: Logger
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

            if (!linkMeta) {
                this.logger?.log("No meta class named 'link' found in scene type", 'error');
            }

            if (!jointMeta) {
                this.logger?.log("No meta class named 'joint' found in scene type", 'error');
            }

            const scaleFactor = 100;
            const parseOrigin = (originElem?: Element) => {
                let coords = { x: 0, y: 0, z: 0 };
                if (!originElem) {
                    return coords;
                }
                const xyzAttr = originElem.getAttribute('xyz');
                if (!xyzAttr) {
                    return coords;
                }
                const parts = xyzAttr.trim().split(/\s+/).map(v => parseFloat(v));
                if (parts.length >= 3 && parts.every(n => !isNaN(n))) {
                    coords = {
                        x: parts[0] * scaleFactor,
                        y: parts[1] * scaleFactor,
                        z: parts[2] * scaleFactor
                    };
                }
                return coords;
            };

            // Instantiate each link using inertial/origin xyz scaled by 100; fallback (0,0,0)
            if (linkMeta && linkElements.length) {
                for (const el of linkElements) {
                    const linkName = el.getAttribute('name') || 'link';
                    const inertial = el.getElementsByTagName('inertial')[0];
                    let originElem: Element | undefined;
                    if (inertial) {
                        originElem = Array.from(inertial.getElementsByTagName('origin'))[0];
                    }
                    // Some URDFs may put <origin> directly under <link> for visuals/collisions; optionally check there if inertial missing
                    if (!originElem) {
                        originElem = Array.from(el.getElementsByTagName('origin'))[0];
                    }

                    const { x, y, z } = parseOrigin(originElem);

                    const classInstance = await this.instanceCreationHandler.createClassInstance(
                        this.instanceCreationHandler.create_UUID(),
                        x,
                        y,
                        z,
                        linkMeta.uuid,
                        'class'
                    );

                    // Set name attribute if exists
                    try {
                        const nameAttrInstance = await this.instanceUtility.getAttributeInstanceFromClassInstance('name', classInstance.uuid, 'name');
                        if (nameAttrInstance) {
                            nameAttrInstance.value = linkName;
                        }
                    } catch { /* optional */ }
                }
            }

            // Instantiate each joint using origin xyz scaled by 100
            if (jointMeta && jointElements.length) {
                for (const el of jointElements) {
                    const jointName = el.getAttribute('name') || 'joint';
                    const originElem = Array.from(el.getElementsByTagName('origin'))[0];
                    const { x, y, z } = parseOrigin(originElem);

                    const classInstance = await this.instanceCreationHandler.createClassInstance(
                        this.instanceCreationHandler.create_UUID(),
                        x,
                        y,
                        z,
                        jointMeta.uuid,
                        'class'
                    );

                    try {
                        const nameAttrInstance = await this.instanceUtility.getAttributeInstanceFromClassInstance('name', classInstance.uuid, 'name');
                        if (nameAttrInstance) {
                            nameAttrInstance.value = jointName;
                        }
                    } catch { /* optional */ }
                }
            }

            // Draw newly created instances if not yet in scene
            await this.persistencyHandler.checkIfClassinstanceInScene();

            // Mark for autosave if enabled
            // this.globalObjectInstance.doSceneInstancePatch is toggled by creator/importers; here we rely on default flow
        } catch (err) {
            this.logger?.log(`URDF processing error: ${err?.message || err}`, 'error');
        }
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
