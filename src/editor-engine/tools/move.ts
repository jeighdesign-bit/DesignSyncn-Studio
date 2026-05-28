import type { CanvasTool, InteractionContext } from '../types';

export class MoveTool implements CanvasTool {
  readonly id = 'move';

  activate(ctx: InteractionContext) {
    ctx.canvas.selection = true;
    ctx.canvas.defaultCursor = 'move';
    ctx.canvas.hoverCursor = 'move';
    ctx.canvas.setCursor('move');
    ctx.canvas.getObjects().forEach(o => {
      if (!(o as any).__isArtboard) {
        o.selectable = !((o as any).__locked);
      }
    });
    ctx.canvas.requestRenderAll();
  }

  deactivate(_ctx: InteractionContext) {}

  onPointerDown(_ctx: InteractionContext) {}
  onPointerMove(_ctx: InteractionContext) {}
  onPointerUp(_ctx: InteractionContext) {}
}
