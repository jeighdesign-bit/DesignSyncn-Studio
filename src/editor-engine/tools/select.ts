import type { CanvasTool, InteractionContext } from '../types';

export class SelectTool implements CanvasTool {
  readonly id = 'select';

  activate(ctx: InteractionContext) {
    ctx.canvas.selection = true;
    ctx.canvas.defaultCursor = 'default';
    ctx.canvas.hoverCursor = 'move';
    ctx.canvas.setCursor('default');
    ctx.canvas.getObjects().forEach(o => {
      if (!(o as any).__isArtboard) {
        const isBg = (o as any).__id?.startsWith('bg-');
        o.selectable = isBg ? false : !((o as any).__locked);
        o.evented = isBg ? false : !((o as any).__locked);
      }
    });
    ctx.canvas.requestRenderAll();
  }

  deactivate(_ctx: InteractionContext) {}

  onPointerDown(_ctx: InteractionContext) {}
  onPointerMove(_ctx: InteractionContext) {}
  onPointerUp(_ctx: InteractionContext) {}
}
