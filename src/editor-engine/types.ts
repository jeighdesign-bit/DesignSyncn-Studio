import * as fabric from 'fabric';

export type EditorState = 'idle' | 'panning' | 'drawing' | 'transforming' | 'editing';

export interface InteractionContext {
  canvas: fabric.Canvas;
  pointer: { x: number; y: number };
  nativeEvent: MouseEvent;
  target?: fabric.FabricObject;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onCreationComplete?: () => void;
  saveHistory: () => void;
  notifyLayers: () => void;
  configureDesignObject: (obj: fabric.FabricObject) => void;
}

export interface CanvasTool {
  id: string;
  activate(ctx: InteractionContext): void;
  deactivate(ctx: InteractionContext): void;
  onPointerDown(ctx: InteractionContext): void;
  onPointerMove(ctx: InteractionContext): void;
  onPointerUp(ctx: InteractionContext): void;
}
