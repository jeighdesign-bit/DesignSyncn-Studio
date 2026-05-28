import * as fabric from 'fabric';

export class SelectionOutlines {
  private hoveredObject: fabric.FabricObject | null = null;

  setHoveredObject(obj: fabric.FabricObject | null) {
    this.hoveredObject = obj;
  }

  getHoveredObject(): fabric.FabricObject | null {
    return this.hoveredObject;
  }

  drawHoverOutline(canvas: fabric.Canvas) {
    if (
      !this.hoveredObject || 
      this.hoveredObject === canvas.getActiveObject() || 
      (this.hoveredObject as any).__isArtboard
    ) {
      return;
    }

    const ctx = canvas.getContext();
    const vpt = canvas.viewportTransform;
    if (!vpt) return;

    const currentZoom = canvas.getZoom();
    const panX = vpt[4];
    const panY = vpt[5];

    // Get object bounding rect in canvas coords
    const rect = this.hoveredObject.getBoundingRect();

    // Convert to screen coordinates
    const sx = rect.left * currentZoom + panX;
    const sy = rect.top * currentZoom + panY;
    const sw = rect.width * currentZoom;
    const sh = rect.height * currentZoom;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 112, 243, 0.75)'; // Figma active blue
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.restore();
  }
}
