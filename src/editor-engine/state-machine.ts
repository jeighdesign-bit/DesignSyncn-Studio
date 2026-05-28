import type { EditorState } from './types';

export class EditorStateMachine {
  private currentState: EditorState = 'idle';
  private onStateChange?: (state: EditorState) => void;

  constructor(onStateChange?: (state: EditorState) => void) {
    this.onStateChange = onStateChange;
  }

  getState(): EditorState {
    return this.currentState;
  }

  transitionTo(newState: EditorState): boolean {
    if (this.currentState === newState) return true;

    const allowed = this.validateTransition(this.currentState, newState);
    if (allowed) {
      this.currentState = newState;
      if (this.onStateChange) {
        this.onStateChange(newState);
      }
      return true;
    }
    return false;
  }

  private validateTransition(from: EditorState, to: EditorState): boolean {
    // Standard professional Figma state transition validation rules
    if (from === 'editing' && to !== 'idle') return false; // Must finish textbox editing before drawing/panning
    if (from === 'panning' && to === 'drawing') return false; // Panning cannot directly transition to shape drawing
    return true;
  }
}
