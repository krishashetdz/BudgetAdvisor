import { useEffect, useMemo, useState } from 'react';
import { GitFork, Play, Pause, RotateCcw, StepForward, Info } from 'lucide-react';
import { Run, TraceNode, money, number } from '../types';
import { TreeGraphic } from './TreeGraphic';

export const SearchTree = ({ run }: { run: Run | null }) => {
  const [strategy, setStrategy] = useState<'fifo' | 'lc'>('lc');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(650);
  const [focused, setFocused] = useState<TraceNode | null>(null);
  const result = run?.[strategy];
  const visits = useMemo(() => (result?.trace || []).filter(t => t.visit_order !== null).sort((a, b) => a.visit_order! - b.visit_order!), [result]);
  useEffect(() => { setStep(visits.length); setPlaying(false); setFocused(null); }, [visits]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setStep(s => {
      if (s >= visits.length) { setPlaying(false); return s; } return s + 1;
    }), speed);
    return () => window.clearInterval(timer);
  }, [playing, visits.length, speed]);
  const currentOrder = step > 0 ? visits[step - 1]?.visit_order || 0 : 0;
  const selected = focused || (step > 0 ? visits[step - 1] : result?.trace[0]);
  return <section className="search-tree-section"><div className="tree-heading"><div><div className="section-heading"><GitFork size={18}/><h2 data-testid="tree-heading">The search, unfolded.</h2><span className="subtle-tag">BRANCH & BOUND</span></div><p data-testid="tree-subtitle">Every branch is a decision. Every bound narrows the possibilities.</p></div><div className="tree-strategy-switch" role="group" aria-label="Search tree strategy">{(['fifo', 'lc'] as const).map(s => <button key={s} className={s === strategy ? 'active' : ''} data-testid={`tree-${s}-button`} aria-pressed={s === strategy} onClick={() => setStrategy(s)}>{s.toUpperCase()}<span>{s === 'fifo' ? 'Queue' : 'Priority queue'}</span></button>)}</div></div>
    <div className="tree-tool"><div className="tree-tool-header"><div className="tree-legends"><span><i className="tree-key solution"/>Selected path</span><span><i className="tree-key explored"/>Explored</span><span><i className="tree-key pruned"/>Pruned</span><span><i className="tree-key frontier"/>Frontier</span></div><span data-testid="tree-rendered-count">{result ? `${result.trace.length} of ${number(result.generated)} generated nodes` : 'Awaiting calculation'}</span></div>
      <div className="tree-canvas">{result ? <TreeGraphic nodes={result.trace} currentOrder={currentOrder} onFocus={setFocused} focusedId={selected?.id}/> : <div className="tree-empty" data-testid="tree-empty-state"><GitFork size={32}/><strong>A new search starts here.</strong><span>Find a combination to reveal the decision tree.</span></div>}</div>
      {result && selected && <div className="node-details" data-testid="node-details"><label>Node <select data-testid="inspect-node-select" aria-label="Inspect tree node" value={selected.id} onChange={e => setFocused(result.trace.find(n => n.id === +e.target.value) || null)}>{result.trace.map(n => <option key={n.id} value={n.id} children={`#${n.id}`}/>)}</select></label><span data-testid="node-decision">{selected.decision === 'root' ? 'Root' : `${selected.decision === 'include' ? 'Include' : 'Exclude'} ${selected.item_name}`}</span><span>Cost <b data-testid="node-cost">{money(selected.cost)}</b></span><span>Score <b data-testid="node-score">{number(selected.score)}</b></span><span>Bound <b data-testid="node-bound">{selected.bound === null ? 'Infeasible' : number(selected.bound)}</b></span><span className="node-state" data-testid="node-state">{selected.visit_order !== null && selected.visit_order <= currentOrder ? selected.status.replaceAll('_', ' ') : 'frontier'}</span></div>}
      <div className="playback-bar"><div className="playback-buttons"><button className="icon-button" data-testid="replay-reset-button" title="Reset replay" aria-label="Reset replay" disabled={!run} onClick={() => { setStep(0); setPlaying(false); setFocused(null); }}><RotateCcw size={15}/></button><button className="play-button" data-testid="replay-play-button" aria-label={playing ? 'Pause replay' : 'Play replay'} disabled={!run || !visits.length} onClick={() => { if (step >= visits.length) setStep(0); setFocused(null); setPlaying(!playing); }}>{playing ? <Pause size={13}/> : <Play size={13}/>}</button><button className="icon-button" data-testid="replay-step-button" title="Next shown visit" aria-label="Next shown visit" disabled={!run || step >= visits.length} onClick={() => { setPlaying(false); setFocused(null); setStep(s => Math.min(s + 1, visits.length)); }}><StepForward size={16}/></button><span className="replay-label">Replay search</span></div><input className="replay-slider" data-testid="replay-slider" aria-label="Replay progress" type="range" min="0" max={Math.max(1, visits.length)} value={step} disabled={!run} onChange={e => { setStep(+e.target.value); setPlaying(false); setFocused(null); }}/><span className="replay-step-count" data-testid="replay-step-count">{step} / {visits.length} shown visits</span><select data-testid="replay-speed-select" aria-label="Replay speed" value={speed} onChange={e => setSpeed(+e.target.value)}><option value={1300}>0.5×</option><option value={650}>1×</option><option value={325}>2×</option></select></div>
    </div>
    <div className="trace-caption"><span data-testid="trace-subset-disclaimer"><Info size={13}/>At most 30 nodes per strategy. Highlighting and replay show only the rendered subset.</span>{result && <span data-testid="trace-omitted-count">{number(result.trace_omitted)} nodes collapsed · {number(result.visited)} total visited · {number(result.pruned)} pruned</span>}</div>
  </section>;
};