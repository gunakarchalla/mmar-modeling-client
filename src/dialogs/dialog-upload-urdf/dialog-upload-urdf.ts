import { EventAggregator } from 'aurelia';
import { Logger } from 'resources/services/logger';
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import * as unzipit from 'unzipit';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import { RoboticsystemAlgorithms } from 'resources/hybridAlgorithms/roboticsystem_algorithms';
import type { ZipEntry } from 'resources/hybridAlgorithms/roboticsystem_algorithms';


export class DialogUploadUrdf {
    private uppy: Uppy | null = null;

    constructor(
        private eventAggregator: EventAggregator,
        private logger: Logger,
        private roboticsystemAlgorithms: RoboticsystemAlgorithms,
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
            this.roboticsystemAlgorithms.meshCache.clear();

            // Parse the zip in-memory.
            const blob: Blob = file.data as Blob;

            const { entries } = await unzipit.unzip(blob);

            // Building a compact index so lookups don't scan repeatedly.
            // Note: unzipit exposes a plain object of entries keyed by path.
            const zipIndex = this.roboticsystemAlgorithms.createZipIndex(entries as Record<string, ZipEntry>);

            // Clear selection after successful read
            this.uppy?.removeFile(file.id);

            // Discover a URDF file in the zip and instantiate links/joints.
            await this.roboticsystemAlgorithms.processZipUrdf(zipIndex);
        } catch (e) {
            // Keep silent for now; can add user feedback/logging later
            this.logger?.log(`URDF upload failed: ${e?.message || e}`, 'error');
        } finally {
            // Ensure transient structures don't survive the import.
            // Note: mesh data referenced by created instances (urdfVizRep) stays alive as needed.
            this.roboticsystemAlgorithms.meshCache.clear();
        }
    }

    private cleanup() {
        if (this.uppy) {
            this.uppy.destroy();
            this.uppy = null;
        }

        // Release any transient import cache when the dialog is closed.
        this.roboticsystemAlgorithms.meshCache.clear();
    }
}
