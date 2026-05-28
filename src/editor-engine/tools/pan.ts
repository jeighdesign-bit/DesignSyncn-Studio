import type { CanvasTool, InteractionContext } from '../types';

export class PanTool implements CanvasTool {
  readonly id = 'hand';
  private isPanning = false;
  private lastPos = { x: 0, y: 0 };

  activate(ctx: InteractionContext) {
    ctx.canvas.selection = false;
    ctx.canvas.discardActiveObject();
    ctx.canvas.getObjects().forEach(o => { o.selectable = false; });
    ctx.canvas.defaultCursor = 'grab';
    ctx.canvas.hoverCursor = 'grab';
    ctx.canvas.setCursor('grab');
    ctx.canvas.requestRenderAll();
  }

  deactivate(ctx: InteractionContext) {
    this.isPanning = false;
    ctx.canvas.selection = true;
    ctx.canvas.defaultCursor = 'default';
    ctx.canvas.hoverCursor = 'move';
  }

  onPointerDown(ctx: InteractionContext) {
    this.isPanning = true;
    this.lastPos = { x: ctx.nativeEvent.clientX, y: ctx.nativeEvent.clientY };
    ctx.canvas.setCursor('grabbing');
  }

  onPointerMove(ctx: InteractionContext) {
    if (!this.isPanning) return;
    const deltaX = ctx.nativeEvent.clientX - this.lastPos.x;
    const deltaY = ctx.nativeEvent.clientY - this.lastPos.y;
    this.lastPos = { x: ctx.nativeEvent.clientX, y: ctx.nativeEvent.clientY };

    const vpt = ctx.canvas.viewportTransform;
    if (vpt) {
      vpt[4] += deltaX;
      vpt[5] += deltaY;
      ctx.canvas.requestRenderAll();
      ctx.onPanChange({ x: vpt[4], y: vpt[5] });
    }
  }

  onPointerUp(ctx: InteractionContext) {
    this.isPanning = false;
    ctx.canvas.setCursor('grab');
  }
}
