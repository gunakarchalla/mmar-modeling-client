import { EventAggregator } from 'aurelia';
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';

import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
// import 'unzipit' as unzipit;

export class DialogUploadUrdf {
    private uppy: Uppy | null = null;

    constructor(private eventAggregator: EventAggregator) {
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
}
