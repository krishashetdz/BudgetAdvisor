import { useMemo } from 'react';
import { TraceNode, number } from '../types';
interface Props { nodes: TraceNode[]; currentOrder: number; onFocus: (node: TraceNode) => void; focusedId?: number }
export const TreeGraphic = ({ nodes, currentOrder, onFocus, focusedId }: Props) => {
  const layout = useMemo(() => {
    const positions = new Map<number, { x: number; y: number }>();
    const children = new Map<number, TraceNode[]>();
    nodes.forEach(n => { if (n.parent !== null) children.set(n.parent, [...(children.get(n.parent) || []), n]); });
    let leaf = 0;
    function place(n: TraceNode): number {
      const kids = children.get(n.id) || [];
      const xs = kids.map(place);
      const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : leaf++;
      positions.set(n.id, { x, y: 36 + n.depth * 66 }); return x;
    }
    if (nodes[0]) place(nodes[0]);
    positions.forEach(p => { p.x = leaf <= 1 ? 520 : 45 + p.x * 950 / (leaf - 1); });
    return { positions, height: Math.max(245, 110 + Math.max(...nodes.map(n => n.depth), 0) * 66) };
  }, [nodes]);
  return <svg className="tree-svg" data-testid="search-tree-svg" viewBox={`0 0 1040 ${layout.height}`} role="img" aria-label="Bounded branch and bound decision tree">
    {nodes.map(n => { const p = layout.positions.get(n.id)!; const parent = n.parent === null ? null : layout.positions.get(n.parent); const active = n.visit_order !== null && n.visit_order <= currentOrder; return parent && <g key={`edge-${n.id}`}><path d={`M${parent.x} ${parent.y + 15} C${parent.x} ${p.y - 28}, ${p.x} ${parent.y + 35}, ${p.x} ${p.y - 15}`} stroke={active && n.on_solution ? '#4f8175' : '#d8deda'} strokeWidth={active && n.on_solution ? 2.2 : 1.5} fill="none" strokeDasharray={n.decision === 'exclude' ? '4 4' : undefined}/><text className="branch-label" x={(parent.x + p.x) / 2 + (n.decision === 'include' ? -7 : 7)} y={(parent.y + p.y) / 2 + 1} textAnchor="middle" fill="#8b9690" fontSize="10">{n.decision === 'include' ? '+' : '−'}</text></g>; })}
    {nodes.map(n => { const p = layout.positions.get(n.id)!; const active = n.visit_order !== null && n.visit_order <= currentOrder; const pruned = n.status.startsWith('pruned'); const fill = !active ? '#f6f7f4' : n.on_solution ? '#4f8175' : pruned ? '#f8ebdc' : '#e9eeeb'; const stroke = focusedId === n.id ? '#d89b43' : !active ? '#cfd8d2' : n.on_solution ? '#4f8175' : pruned ? '#d7af77' : '#bdcbc2'; return <g key={n.id} className="tree-node" data-testid={`tree-node-${n.id}`} role="button" tabIndex={0} aria-label={`Node ${n.id}, ${n.decision}, score ${n.score}, bound ${n.bound ?? 'infeasible'}`} onClick={() => onFocus(n)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus(n); } }}>
      <title>{`${n.decision} ${n.item_name || 'root'} · score ${n.score} · bound ${n.bound ?? 'infeasible'} · ${active ? n.status : 'frontier'}`}</title><circle cx={p.x} cy={p.y} r={16} fill={fill} stroke={stroke} strokeWidth={focusedId === n.id ? 3 : 1.5}/><text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={active && n.on_solution ? '#fff' : '#65756c'}>{n.id}</text><text className="node-bound-label" x={p.x} y={p.y + 32} textAnchor="middle" fontSize="10" fill="#7f8b84">{n.bound === null ? 'over budget' : `b: ${number(n.bound)}`}</text>{n.hidden_children > 0 && <g data-testid={`collapsed-branch-${n.id}`}><path d={`M${p.x} ${p.y + 36} v8`} stroke="#bec9c1" strokeDasharray="2 2"/><text x={p.x} y={p.y + 56} textAnchor="middle" fontSize="10" fill="#a47a3d">+{n.hidden_children} branches</text></g>}
    </g>; })}
  </svg>;
};