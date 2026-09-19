import { useState } from 'react';
import { toast } from 'sonner';
import { Bookmark, RotateCcw, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { api, errorMessage } from '../api';
import { Run } from '../types';
interface Props { run?: Run; onClose: () => void; onSaved?: (r: Run) => void; reset?: boolean; onReset?: () => void }
export const SaveDialog = ({ run, onClose, onSaved, reset, onReset }: Props) => {
  const [title, setTitle] = useState(run?.title || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!title.trim() || !run) return;
    setBusy(true); setError('');
    try { const { data } = await api.put<Run>(`/runs/${run.id}/save`, { title }); onSaved?.(data); toast.success('Run saved to your collection'); onClose(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={onClose}><DialogContent className="app-dialog" data-testid={reset ? 'reset-dialog' : 'save-dialog'}><DialogHeader><span className="dialog-icon">{reset ? <RotateCcw/> : <Bookmark/>}</span><DialogTitle data-testid="dialog-title">{reset ? 'A fresh starting point?' : 'Save this algorithm run.'}</DialogTitle><DialogDescription data-testid="dialog-description">{reset ? 'Your current mode’s edits and selection will be reset. You can Undo this change; saved runs stay safe.' : 'Stores the input snapshot, solver results, DP baseline and replay. Manual choices stay in this workspace.'}</DialogDescription></DialogHeader>{!reset && <div className="dialog-field"><label htmlFor="run-title">Run name</label><input id="run-title" data-testid="save-run-title" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(); }} autoFocus/></div>}{error && <p className="validation-message" data-testid="save-error">{error}</p>}<DialogFooter><Button variant="outline" data-testid="dialog-cancel-button" onClick={onClose}>Cancel</Button><Button className="primary-button" data-testid="dialog-confirm-button" disabled={busy || (!reset && !title.trim())} onClick={reset ? onReset : save}>{busy && <Loader2 className="spin" size={14}/>} {reset ? 'Reset sample' : 'Save run'}</Button></DialogFooter></DialogContent></Dialog>;
};