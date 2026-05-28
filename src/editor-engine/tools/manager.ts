import type { CanvasTool, InteractionContext, EditorState } from '../types';
import { EditorStateMachine } from '../state-machine';

export class ToolManager {
  private activeTool: CanvasTool | null = null;
  private tools = new Map<string, CanvasTool>();
  public stateMachine: EditorStateMachine;

  constructor(onStateChange?: (state: EditorState) => void) {
    this.stateMachine = new EditorStateMachine(onStateChange);
  }

  registerTool(tool: CanvasTool) {
    this.tools.set(tool.id, tool);
  }

  getActiveTool(): CanvasTool | null {
    return this.activeTool;
  }

  setTool(id: string, context: InteractionContext) {
    const nextTool = this.tools.get(id);
    if (!nextTool) return;

    if (this.activeTool) {
      this.activeTool.deactivate(context);
    }
    this.activeTool = nextTool;
    this.activeTool.activate(context);
  }

  onPointerDown(context: InteractionContext) {
    if (this.activeTool) {
      this.activeTool.onPointerDown(context);
    }
  }

  onPointerMove(context: InteractionContext) {
    if (this.activeTool) {
      this.activeTool.onPointerMove(context);
    }
  }

  onPointerUp(context: InteractionContext) {
    if (this.activeTool) {
      this.activeTool.onPointerUp(context);
    }
  }

  destroy(context: InteractionContext) {
    if (this.activeTool) {
      this.activeTool.deactivate(context);
      this.activeTool = null;
    }
    this.tools.clear();
  }
}
