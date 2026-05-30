import * as fabric from 'fabric';
import type { CanvasTool, InteractionContext } from '../types';

let shapeCounter = 1;

export class RectangleTool implements CanvasTool {
  readonly id = 'shape';
  private startPoint: { x: number; y: number } | null = null;
  private activeRect: fabric.Rect | null = null;

  activate(ctx: InteractionContext) {
    ctx.canvas.selection = false;
    ctx.canvas.defaultCursor = 'crosshair';
    ctx.canvas.hoverCursor = 'crosshair';
    ctx.canvas.setCursor('crosshair');
    ctx.canvas.discardActiveObject();
    ctx.canvas.requestRenderAll();
  }

  deactivate(_ctx: InteractionContext) {
    this.startPoint = null;
    this.activeRect = null;
  }

  onPointerDown(ctx: InteractionContext) {
    const isTargetArtboard = ctx.target && ((ctx.target as any).__isArtboard || (ctx.target as any).__id?.startsWith('bg-'));
    const canPlace = !ctx.target || isTargetArtboard;
    if (!canPlace) return;

    this.startPoint = { x: ctx.pointer.x, y: ctx.pointer.y };

    const rect = new fabric.Rect({
      left: ctx.pointer.x,
      top: ctx.pointer.y,
      width: 0,
      height: 0,
      fill: '#0070f3',
      stroke: '#ffffff',
      strokeWidth: 2,
      rx: 8,
      ry: 8,
    });
    (rect as any).__id = `shape-${Date.now()}`;
    (rect as any).__layerName = `Shape ${shapeCounter++}`;

    ctx.canvas.add(rect);
    this.activeRect = rect;
  }

  onPointerMove(ctx: InteractionContext) {
    if (!this.startPoint || !this.activeRect) return;

    const currentX = ctx.pointer.x;
    const currentY = ctx.pointer.y;

    const left = Math.min(this.startPoint.x, currentX);
    const top = Math.min(this.startPoint.y, currentY);
    const width = Math.abs(this.startPoint.x - currentX);
    const height = Math.abs(this.startPoint.y - currentY);

    this.activeRect.set({
      left,
      top,
      width,
      height,
    });
    this.activeRect.setCoords();
    ctx.canvas.requestRenderAll();
  }

  onPointerUp(ctx: InteractionContext) {
    if (!this.startPoint || !this.activeRect) return;

    const width = this.activeRect.width ?? 0;
    const height = this.activeRect.height ?? 0;

    // Click placement fallback
    if (width < 5 || height < 5) {
      this.activeRect.set({
        left: this.startPoint.x,
        top: this.startPoint.y,
        width: 120,
        height: 80,
        originX: 'center',
        originY: 'center',
      });
      // Center position correction
      this.activeRect.set({
        left: this.startPoint.x - 60,
        top: this.startPoint.y - 40,
        originX: 'left',
        originY: 'top'
      });
    } else {
      this.activeRect.set({
        originX: 'left',
        originY: 'top',
      });
    }

    this.activeRect.setCoords();
    ctx.configureDesignObject(this.activeRect);
    ctx.canvas.setActiveObject(this.activeRect);
    ctx.canvas.requestRenderAll();

    this.startPoint = null;
    this.activeRect = null;

    ctx.saveHistory();
    ctx.notifyLayers();

    if (!ctx.nativeEvent.shiftKey && ctx.onCreationComplete) {
      ctx.onCreationComplete();
    }
  }
}
