/**
 * Conversions between browser `File` objects, data-URL strings and the raw buffers the
 * server returns. Pure and dependency-free; used by `meta-utility` (bufferToFile) and
 * `expression-utility` (FiletoDataUrl).
 */
export class FileUtility {
  async FiletoDataUrl(file: File): Promise<string> {
    // FileReader yields the `data:<mime>;base64,<...>` form directly, with no Node
    // Buffer involved (there are no node polyfills in the browser bundle).
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  bufferToFile(
    bufferObj: { data: number[] },
    filename: string,
    mimeType: string,
    creationTime: string | number | Date,
    modificationTime: string | number | Date,
  ): File {
    // Convert numeric data array into a Uint8Array
    const uint8Array = new Uint8Array(bufferObj.data);

    // Create a Blob from the binary data
    const blob = new Blob([uint8Array], { type: mimeType });

    // Parse modificationTime into a timestamp for lastModified
    const lastModified = new Date(modificationTime).getTime();

    // Construct the File, setting its MIME type and lastModified timestamp
    const file = new File([blob], filename, { type: mimeType, lastModified });

    // Attach creationTime as a non-standard, read-only property
    Object.defineProperty(file, "creationTime", {
      value: new Date(creationTime),
      writable: false,
      enumerable: true,
    });

    return file;
  }
}

// Module singleton — one shared instance.
export const fileUtility = new FileUtility();
