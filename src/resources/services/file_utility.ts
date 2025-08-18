export class FileUtility {
    async DataUrltoFile(url, filename, mimeType?) {
        if (url.startsWith('data:')) {
            const arr = url.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[arr.length - 1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const file = new File([u8arr], filename, { type: mime || mimeType });
            return Promise.resolve(file);
        }
        return fetch(url)
            .then(res => res.arrayBuffer())
            .then(buf => new File([buf], filename, { type: mimeType }));
    }

    async FiletoDataUrl(file: File): Promise<string> {
        const fileContent = await file.arrayBuffer();
        const base64 = Buffer.from(new Uint8Array(fileContent)).toString('base64');
        return `data:${file.type};base64,${base64}`;
    }

    bufferToFile(bufferObj, filename, mimeType, creationTime, modificationTime) {
        // Convert numeric data array into a Uint8Array
        const uint8Array = new Uint8Array(bufferObj.data);

        // Create a Blob from the binary data
        const blob = new Blob([uint8Array], { type: mimeType });

        // Parse modificationTime into a timestamp for lastModified
        const lastModified = new Date(modificationTime).getTime();

        // Construct the File, setting its MIME type and lastModified timestamp
        const file = new File([blob], filename, { type: mimeType, lastModified });

        // Attach creationTime as a non-standard, read-only property
        Object.defineProperty(file, 'creationTime', {
            value: new Date(creationTime),
            writable: false,
            enumerable: true
        });

        return file;
    }
}