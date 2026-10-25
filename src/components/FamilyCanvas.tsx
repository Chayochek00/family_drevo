import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, MiniMap, ReactFlow, Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import dagre from 'dagre';
import type { Person, Relationship } from '../types';
import { signedPhotoUrl } from '../lib/image';

type PersonNodeData = { person: Person; photoUrl: string | null; onEdit: (p: Person) => void };
function PersonNode({ data }: NodeProps<Node<PersonNodeData>>) {
  const { person, photoUrl, onEdit } = data;
  const fullName = `${person.first_name} ${person.last_name ?? ''}`.trim();
  return <div className="person-node" onDoubleClick={() => onEdit(person)} title="Дважды щёлкните, чтобы редактировать">
    <Handle type="target" position={Position.Top} />
    {photoUrl ? <img className="node-avatar" src={photoUrl} alt="" /> : <div className="node-avatar placeholder">{person.first_name.slice(0,1).toUpperCase()}</div>}
    <div className="node-name">{fullName}</div>
    <div className="node-dates">{person.birth_date?.slice(0,4) ?? '—'}{person.death_date ? ` – ${person.death_date.slice(0,4)}` : ''}</div>
    <button className="node-edit" onClick={e => { e.stopPropagation(); onEdit(person); }}>Изменить</button>
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
const nodeTypes = { person: PersonNode };
type Props = { persons: Person[]; relationships: Relationship[]; onEdit: (p: Person) => void; onConnect: (from: string, to: string, type: 'parent' | 'sibling' | 'spouse' | 'uncle_aunt' | 'niece_nephew') => void };

function layoutNodes(nodes: Node<PersonNodeData>[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'TB', nodesep: 48, ranksep: 90, marginx: 30, marginy: 30 });
  nodes.forEach(n => graph.setNode(n.id, { width: 190, height: 180 }));
  edges.forEach(e => graph.setEdge(e.source, e.target));
  dagre.layout(graph);
  return nodes.map(n => {
    const p = graph.node(n.id);
    return { ...n, position: { x: p.x - 95, y: p.y - 90 } };
  });
}

export default function FamilyCanvas({ persons, relationships, onEdit, onConnect }: Props) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [type, setType] = useState<'parent' | 'sibling' | 'spouse' | 'uncle_aunt' | 'niece_nephew'>('parent');

  useEffect(() => {
    let cancelled = false;
    Promise.all(persons.map(async p => [p.id, await signedPhotoUrl(p.photo_path)] as const)).then(items => {
      if (!cancelled) setPhotoUrls(Object.fromEntries(items.filter((v): v is readonly [string, string] => Boolean(v[1]))));
    });
    return () => { cancelled = true; };
  }, [persons]);

  const { nodes, edges } = useMemo(() => {
    const baseEdges: Edge[] = relationships.map(r => ({
      id: r.id, source: r.from_person_id, target: r.to_person_id,
      label: r.type === 'parent' ? 'родитель' : r.type === 'spouse' ? 'супруги' : r.type === 'uncle_aunt' ? 'дядя/тётя' : r.type === 'niece_nephew' ? 'племянник/племянница' : 'брат/сестра',
      type: 'smoothstep', animated: false,
      style: { stroke: r.type === 'spouse' ? '#c084fc' : '#93a4bd', strokeWidth: 2 },
      labelStyle: { fill: 'var(--muted)', fontSize: 10 },
    }));
    const baseNodes: Node<PersonNodeData>[] = persons.map(p => ({
      id: p.id, type: 'person', data: { person: p, photoUrl: photoUrls[p.id] ?? null, onEdit }, position: { x: 0, y: 0 },
    }));
    return { nodes: layoutNodes(baseNodes, baseEdges), edges: baseEdges };
  }, [persons, relationships, photoUrls, onEdit]);

  return <div className="canvas-wrap">
    <div className="relationship-toolbar">
      <span className="muted small">Добавить связь:</span>
      <select aria-label="Первая персона" value={source} onChange={e => setSource(e.target.value)}><option value="">От кого…</option>{persons.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      <select aria-label="Тип связи" value={type} onChange={e => setType(e.target.value as typeof type)}><option value="parent">Родитель → ребёнок</option><option value="sibling">Брат / сестра</option><option value="spouse">Супруги</option><option value="uncle_aunt">Дядя / тётя → племянник/племянница</option><option value="niece_nephew">Племянник/племянница → дядя/тётя</option></select>
      <select aria-label="Вторая персона" value={target} onChange={e => setTarget(e.target.value)}><option value="">С кем…</option>{persons.filter(p => p.id !== source).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      <button className="secondary small-button" disabled={!source || !target || source === target} onClick={() => { onConnect(source, target, type); setSource(''); setTarget(''); }}>Связать</button>
    </div>
    <div className="canvas">
      {persons.length === 0 ? <div className="empty-canvas"><div className="empty-icon">✳</div><h3>Здесь начнётся ваша история</h3><p>Добавьте первую персону, затем соедините родственников.</p></div> :
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.15} maxZoom={2.2} nodesDraggable nodesConnectable={false} proOptions={{ hideAttribution: true }}>
          <Background color="var(--grid)" gap={22} /><Controls /><MiniMap pannable zoomable nodeColor="var(--accent)" />
        </ReactFlow>}
    </div>
  </div>;
}
