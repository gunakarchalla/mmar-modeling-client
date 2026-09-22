// Loaded before any test module. The gds DTOs use class-transformer decorators
// (@Type) which call Reflect.* — mirror main.tsx by importing reflect-metadata first.
import "reflect-metadata";

// jsdom's Blob (and therefore File) predates Blob.text()/arrayBuffer(), which every
// real browser has shipped for years and which the file-reading views use directly
// (the import dialogs and UploadGltfDialog). Without this, `await file.text()`
// throws "f.text is not a function" INSIDE a try/catch and surfaces as an empty
// import rather than an obvious failure — so polyfill it for tests only.
//
// Guarded, so it disappears for free the day jsdom implements them. Not needed in
// production: this file is a vitest setup file, never bundled.
if (typeof Blob !== "undefined") {
  if (typeof Blob.prototype.arrayBuffer !== "function") {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }

  if (typeof Blob.prototype.text !== "function") {
    Blob.prototype.text = function text(this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
}
