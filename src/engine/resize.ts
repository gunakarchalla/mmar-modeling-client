import { globalObject } from "@/engine/global-definition";

/**
 * Keeps both cameras and the renderer in step with the canvas container. Called by
 * ThreeCanvas's ResizeObserver and by the window resize listener.
 */
export class Resize {
  private globalObjectInstance = globalObject;

  resize() {
    const containerWidth = this.globalObjectInstance.elementContainer.clientWidth;
    const containerHeight = this.globalObjectInstance.elementContainer.clientHeight;
    const aspectRatio = containerWidth / containerHeight;
    const nearPlane = 0.1;
    const farPlane = 5000;

    // resize Perspective Camera
    const fov = 70; // Field of view in degrees

    this.globalObjectInstance.normalCamera3d.fov = fov;
    this.globalObjectInstance.normalCamera3d.aspect = aspectRatio;
    this.globalObjectInstance.normalCamera3d.near = nearPlane;
    this.globalObjectInstance.normalCamera3d.far = farPlane;

    this.globalObjectInstance.normalCamera3d.position.set(0, 0, 10);
    this.globalObjectInstance.normalCamera3d.updateProjectionMatrix();

    // resize Orthographic Camera
    const frustumSize = 10; // This can be adjusted as needed

    this.globalObjectInstance.normalCamera2d.left = (frustumSize * aspectRatio) / -2;
    this.globalObjectInstance.normalCamera2d.right = (frustumSize * aspectRatio) / 2;
    this.globalObjectInstance.normalCamera2d.top = frustumSize / 2;
    this.globalObjectInstance.normalCamera2d.bottom = frustumSize / -2;
    this.globalObjectInstance.normalCamera2d.near = nearPlane;
    this.globalObjectInstance.normalCamera2d.far = farPlane;

    this.globalObjectInstance.normalCamera2d.position.set(0, 0, 10);
    this.globalObjectInstance.normalCamera2d.zoom = 1; // Adjust zoom to match perspective view
    this.globalObjectInstance.normalCamera2d.updateProjectionMatrix();

    this.globalObjectInstance.renderer.setSize(this.globalObjectInstance.elementContainer.clientWidth, this.globalObjectInstance.elementContainer.clientHeight, true);

    this.globalObjectInstance.render = true;
  }
}

// Module singleton — one shared instance.
export const resize = new Resize();
