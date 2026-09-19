import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Play, Pause, RotateCcw, StepForward, SkipForward, Check, GitBranch, Info } from 'lucide-react';
import { Run, SearchFrame, SolverResult, LiveProgress, number } from '../types';
import { TreeGraphic } from './TreeGraphic';

const emptyFrame: SearchFrame = { visited: 0, pruned: 0, best_score: 0, frontier: 0, generated: 0 };
function frames(result?: SolverResult): SearchFrame[] {
  if (!result) return [];
  return result.progress?.length ? result.progress : [{ visited: result.visited, pruned: result.pruned,
    best_score: result.total_score, frontier: result.frontier_remaining, generated: result.generated }];
}
function atVisit(list: SearchFrame[], visit: number): SearchFrame {
  let lo = 0, hi = list.length - 1, found = -1;
  while (lo <= hi) { const mid = Math.floor((lo + hi) / 2); if (list[mid].visited <= visit) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found < 0 ? emptyFrame : list[found];
}

export const SearchTree = ({ run, live, busy }: { run: Run | null; live: LiveProgress; busy: boolean }) => {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(110);
  const reduced = useReducedMotion();
  const legacy = !!run && (!run.fifo.progress?.length || !run.lc.progress?.length);
  const fifoFrames = useMemo(() => frames(run?.fifo), [run?.fifo]);
  const lcFrames = useMemo(() => frames(run?.lc), [run?.lc]);
  const timeline = useMemo(() => [0, ...Array.from(new Set([...fifoFrames, ...lcFrames].map(f => f.visited).filter(v => v > 0))).sort((a, b) => a - b)], [fifoFrames, lcFrames]);
  useEffect(() => {
    const autoplay = !!run && !run.saved && !reduced && !legacy;
    setStep(autoplay ? 0 : timeline.length - 1); setPlaying(autoplay);
    // A save response must not restart a running replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, reduced]);
  useEffect(() => {
    if (!playing || !run) return;
    const timer = window.setInterval(() => setStep(s => {
      if (s >= timeline.length - 1) { setPlaying(false); return s; }
      return s + 1;
    }), speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, timeline.length, run]);
  const tick = timeline[Math.min(step, timeline.length - 1)] || 0;
  const finished = !!run && step >= timeline.length - 1;
  const hasBatching = timeline.some((v, i) => i > 0 && v - timeline[i - 1] > 1);
  const go = (n: number) => { setPlaying(false); setStep(Math.max(0, Math.min(timeline.length - 1, n))); };
  return <section className="race-section" aria-label="Side-by-side search race">
    <div className="race-heading"><div><span className="section-kicker" data-testid="race-eyebrow">THE SEARCH RACE</span><h2 data-testid="tree-heading">Same problem. Two different paths.</h2></div><span className="race-status" data-testid="race-status"><i className={playing || busy ? 'running-dot' : ''}/>{busy ? 'Live computation' : legacy ? 'Saved snapshot' : playing ? 'Replaying measured visits' : finished ? 'Search replay complete' : run ? 'Replay paused' : 'Ready to explore'}</span></div>
    <div className="race-board"><div className="race-panels">{(['fifo', 'lc'] as const).map(strategy => {
      const result = run?.[strategy];
      const frame = run ? atVisit(strategy === 'fifo' ? fifoFrames : lcFrames, tick) : live[strategy] || emptyFrame;
      const nodes = result?.trace || live[strategy]?.trace || [];
      const done = !!result && frame.visited >= result.visited;
      return <div className={`race-panel race-${strategy}`} key={strategy} data-testid={`${strategy}-race-panel`}>
        <div className="race-panel-header"><div><div className="algorithm-name"><span className="algorithm-mark"><GitBranch size={15}/></span><h3 data-testid={`${strategy}-strategy-label`}>{strategy.toUpperCase()}</h3><span>{strategy === 'fifo' ? 'First in, first out' : 'Highest bound first'}</span></div><span className="algorithm-status" data-testid={`${strategy}-race-state`}>{done ? (result?.proven_optimal ? <><Check size={12}/>Optimality proven</> : 'Limit reached · not proven') : frame.visited ? 'Exploring the frontier' : 'Awaiting first visit'}</span></div><div className="race-counter"><strong data-testid={`${strategy}-node-count`}>{number(frame.visited)}</strong><span>nodes visited</span></div></div>
        <TreeGraphic key={`${run?.id || 'live'}-${strategy}`} strategy={strategy} nodes={nodes} currentOrder={frame.visited} complete={done} busy={busy}/>
        <div className="race-panel-footer"><span>Pruned <b data-testid={`${strategy}-pruned-live`}>{number(frame.pruned)}</b></span><span>Frontier <b data-testid={`${strategy}-frontier-live`}>{number(frame.frontier)}</b></span><span>Best value <b data-testid={`${strategy}-best-live`}>{number(frame.best_score)}</b></span>{result && <span className="compute-time" data-testid={`${strategy}-compute-time`}>{result.elapsed_ms.toFixed(2)} ms compute</span>}</div>
      </div>;
    })}</div>
    <fieldset className="race-controls" disabled={legacy}><div className="race-transport"><button className="icon-button" data-testid="replay-reset-button" title="Restart from the root" aria-label="Reset replay" disabled={!run} onClick={() => go(0)}><RotateCcw size={16}/></button><button className="race-play" data-testid="replay-play-button" aria-label={playing ? 'Pause replay' : 'Play replay'} disabled={!run} onClick={() => { if (finished) setStep(0); setPlaying(!playing); }}>{playing ? <Pause size={15}/> : <Play size={15}/>}<span>{playing ? 'Pause' : 'Play'}</span></button><button className="icon-button" data-testid="replay-step-button" title="Next measured step" aria-label="Next measured step" disabled={!run || finished} onClick={() => go(step + 1)}><StepForward size={17}/></button><button className="icon-button" data-testid="replay-end-button" title="Jump to result" aria-label="Jump to result" disabled={!run || finished} onClick={() => go(timeline.length - 1)}><SkipForward size={17}/></button></div><input data-testid="replay-slider" className="race-timeline" aria-label="Race timeline" type="range" min="0" max={Math.max(1, timeline.length - 1)} value={step} disabled={!run} onChange={e => go(+e.target.value)}/><span className="race-position" data-testid="replay-step-count">Visit <b>{number(tick)}</b><span> / {number(timeline[timeline.length - 1] || 0)}</span></span><select data-testid="replay-speed-select" aria-label="Replay speed" value={speed} onChange={e => setSpeed(+e.target.value)}><option value={220}>0.5×</option><option value={110}>1×</option><option value={55}>2×</option></select></fieldset>
    </div>
    <div className="race-footnotes"><div className="tree-legend" data-testid="race-legend"><span><i className="legend-explored"/>Explored</span><span><i className="legend-optimal"/>Selected path</span><span><i className="legend-pruned"/>Pruned</span></div><p data-testid="trace-subset-disclaimer"><Info size={12}/>{legacy ? 'This older snapshot has no detailed progress. Recalculate to enable the race.' : `Visit-synchronized replay, not wall-clock speed. First 30 generated nodes per tree; counters include all work.${hasBatching ? ' Long searches use batched steps.' : ''}`}</p></div>
    <div className="race-disclosure" data-testid="trace-omitted-count">{run ? `FIFO: ${number(run.fifo.trace_omitted)} nodes collapsed · LC: ${number(run.lc.trace_omitted)} nodes collapsed` : 'Both searches use the same item ordering and upper bound.'}<span data-testid="measurement-disclaimer">LC is not guaranteed to visit fewer nodes.</span></div>
  </section>;
};