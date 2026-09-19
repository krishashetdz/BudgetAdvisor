import { Undo2, Redo2, RotateCcw } from 'lucide-react';
export const HistoryActions = ({ canUndo, canRedo, undo, redo, reset }: {
  canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void; reset: () => void;
}) => <div className="history-actions" role="group" aria-label="Edit history">
  <button className="icon-button" title="Undo last change" aria-label="Undo last change" data-testid="undo-button" disabled={!canUndo} onClick={undo}><Undo2 size={16}/></button>
  <button className="icon-button" title="Redo last change" aria-label="Redo last change" data-testid="redo-button" disabled={!canRedo} onClick={redo}><Redo2 size={16}/></button>
  <span className="history-divider"/>
  <button className="icon-button" title="Reset sample dataset" aria-label="Reset sample dataset" data-testid="reset-sample-button" onClick={reset}><RotateCcw size={16}/></button>
</div>;