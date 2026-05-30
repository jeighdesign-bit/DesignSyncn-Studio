import * as fabric from 'fabric';
import type { CanvasTool, InteractionContext } from '../types';

let textCounter = 1;

export class TextTool implements CanvasTool {
  readonly id = 'text';

  activate(ctx: InteractionContext) {
    ctx.canvas.selection = false;
    ctx.canvas.defaultCursor = 'text';
    ctx.canvas.hoverCursor = 'text';
    ctx.canvas.setCursor('text');
    ctx.canvas.discardActiveObject();
    ctx.canvas.requestRenderAll();
  }

  deactivate(_ctx: InteractionContext) {}

  onPointerDown(ctx: InteractionContext) {
    const isTargetArtboard = ctx.target && ((ctx.target as any).__isArtboard || (ctx.target as any).__id?.startsWith('bg-'));
    const canPlace = !ctx.target || isTargetArtboard;
    if (!canPlace) return;

    const text = new fabric.Textbox('Click to edit', {
      left: ctx.pointer.x,
      top: ctx.pointer.y,
      width: 250,
      fontFamily: 'Outfit, sans-serif',
      fontSize: 48,
      fontWeight: '800',
      fill: '#ffffff',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      splitByGrapheme: true,
    } as any);
    (text as any).__id = `text-${Date.now()}`;
    (text as any).__layerName = `Text ${textCounter++}`;

    ctx.canvas.add(text);
    ctx.configureDesignObject(text);
    ctx.canvas.setActiveObject(text);
    text.enterEditing();
    ctx.canvas.requestRenderAll();

    ctx.saveHistory();
    ctx.notifyLayers();

    if (!ctx.nativeEvent.shiftKey && ctx.onCreationComplete) {
      ctx.onCreationComplete();
    }
  }

  onPointerMove(_ctx: InteractionContext) {}
  onPointerUp(_ctx: InteractionContext) {}
}
