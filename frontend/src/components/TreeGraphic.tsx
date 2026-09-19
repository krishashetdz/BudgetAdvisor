import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GitFork, X } from 'lucide-react';
import { TraceNode, number, money } from '../types';
interface Props { strategy: string; nodes: TraceNode[]; currentOrder: number; complete: boolean; busy: boolean }
export const TreeGraphic = ({ strategy, nodes, currentOrder, complete, busy }: Props) => {
  const [hovered, setHovered] = useState<{ node: TraceNode; x: number; y: number } | null>(null);
  const reduced = useReducedMotion();
  const layout = useMemo(() => {
    const positions = new Map<number, { x: number; y: number }>();
    const children = new Map<number, TraceNode[]>();
    nodes.forEach(n => { if (n.parent !== null) children.set(n.parent, [...(children.get(n.parent) || []), n]); });
    let leaf = 0;
    const depth = Math.max(...nodes.map(n => n.depth), 1);
    function place(n: TraceNode): number {
      const xs = (children.get(n.id) || []).map(place);
      const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : leaf++;
      positions.set(n.id, { x, y: 30 + n.depth * 270 / depth }); return x;
    }
    if (nodes[0]) place(nodes[0]);
    positions.forEach(p => { p.x = leaf <= 1 ? 300 : 27 + p.x * 546 / (leaf - 1); });
    return positions;
  }, [nodes]);
  const visited = nodes.filter(n => n.visit_order !== null && n.visit_order <= currentOrder);
  const show = (node: TraceNode, e: React.MouseEvent<SVGGElement> | React.FocusEvent<SVGGElement>) => {
    const element = e.currentTarget, frame = element.closest('.race-canvas')!.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setHovered({ node, x: Math.max(8, Math.min(frame.width - 216, rect.x - frame.x - 94)), y: Math.max(8, rect.y - frame.y - 116) });
  };
  return <div className="race-canvas" data-testid={`${strategy}-tree-canvas`} onMouseLeave={() => setHovered(null)}>
    {!visited.length && <div className="race-empty" data-testid={`${strategy}-tree-empty`}><GitFork size={22}/><span>{busy ? 'Receiving search events' : nodes.length ? 'Start at the root' : 'No search yet'}</span></div>}
    <svg className="race-tree-svg" data-testid={`${strategy}-search-tree-svg`} viewBox="0 0 600 344" role="img" aria-label={`${strategy.toUpperCase()} decision tree`}>
      {visited.map(n => {
        const p = layout.get(n.id)!; const parent = n.parent === null ? null : layout.get(n.parent);
        const pruned = n.status.startsWith('pruned');
        return parent && <motion.path key={`edge-${n.id}`} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: pruned ? .45 : 1 }} transition={{ duration: .22 }} d={`M${parent.x} ${parent.y + 11} C${parent.x} ${(parent.y + p.y) / 2},${p.x} ${(parent.y + p.y) / 2},${p.x} ${p.y - 11}`} className={`race-edge ${complete && n.on_solution ? 'solution-edge' : ''}`} fill="none" strokeDasharray={n.decision === 'exclude' ? '3 3' : undefined}/>;
      })}
      {visited.map(n => {
        const p = layout.get(n.id)!; const pruned = n.status.startsWith('pruned');
        const state = pruned ? 'pruned-node' : complete && n.on_solution ? 'solution-node' : 'explored-node';
        return <g key={n.id} transform={`translate(${p.x},${p.y})`}>
          <motion.g className={`race-node ${state} ${n.visit_order === currentOrder && !complete ? 'current-node' : ''}`} initial={reduced ? false : { opacity: 0, scale: .55 }} animate={{ opacity: pruned ? .52 : 1, scale: 1 }} transition={{ duration: .2, ease: 'easeOut' }} data-testid={`${strategy}-tree-node-${n.id}`} role="button" tabIndex={0} aria-label={`Node ${n.id}, ${n.decision}, value ${n.score}, bound ${n.bound ?? 'infeasible'}`} onMouseEnter={e => show(n, e)} onFocus={e => show(n, e)} onBlur={() => setHovered(null)} onClick={e => show(n, e)} onKeyDown={e => { if (e.key === 'Escape') setHovered(null); }}>
            <circle r="12"/><text y="3.5" textAnchor="middle">{n.id}</text>
            {n.hidden_children > 0 && <g data-testid={`${strategy}-collapsed-branch-${n.id}`} className="collapsed-marker"><path d="M0 14 v8"/><text y="31" textAnchor="middle" children={`+${n.hidden_children}`}/></g>}
          </motion.g>
        </g>;
      })}
    </svg>
    {hovered && hovered.node.visit_order !== null && hovered.node.visit_order <= currentOrder && <div className="node-tooltip" role="tooltip" data-testid={`${strategy}-node-tooltip`} style={{ left: hovered.x, top: hovered.y }}><div><strong data-testid={`${strategy}-tooltip-title`}>{hovered.node.decision === 'root' ? 'Root node' : `${hovered.node.decision === 'include' ? 'Include' : 'Exclude'} · #${hovered.node.id}`}</strong><button aria-label="Close node details" data-testid={`${strategy}-tooltip-close`} onClick={() => setHovered(null)}><X size={12}/></button></div>{hovered.node.item_name && <p>{hovered.node.item_name}</p>}<dl><div><dt>Value</dt><dd data-testid={`${strategy}-tooltip-value`}>{number(hovered.node.score)}</dd></div><div><dt>Bound</dt><dd data-testid={`${strategy}-tooltip-bound`}>{hovered.node.bound === null ? 'Infeasible' : number(hovered.node.bound)}</dd></div><div><dt>Cost</dt><dd>{money(hovered.node.cost)}</dd></div></dl><span>{hovered.node.status.replaceAll('_', ' ')}</span></div>}
  </div>;
};