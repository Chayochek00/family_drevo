import { useEffect, useState, useCallback } from 'react';
import { Background, Controls, MiniMap, ReactFlow, Handle, Position, useNodesState, useEdgesState, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react';
import dagre from 'dagre';
import type { Person, Relationship } from '../types';
import { signedPhotoUrl } from '../lib/image';

type PersonNodeData = { person: Person; photoUrl: string | null; onEdit: (p: Person) => void; readOnly?: boolean };
function PersonNode({ data }: NodeProps<Node<PersonNodeData>>) {
  const { person, photoUrl, onEdit, readOnly = false } = data;
  const fullName = `${person.first_name} ${person.last_name ?? ''}`.trim();
  return <div className="person-node" onDoubleClick={() => { if (!readOnly) onEdit(person); }} title={readOnly ? 'Только просмотр' : 'Дважды щёлкните, чтобы редактировать'}>
    <Handle type="target" position={Position.Top} />
    {photoUrl ? <img className="node-avatar" src={photoUrl} alt="" /> : <div className="node-avatar placeholder">{person.first_name.slice(0,1).toUpperCase()}</div>}
    <div className="node-name">{fullName}</div>
    <div className="node-dates">{person.birth_date?.slice(0,4) ?? '—'}{person.death_date ? ` – ${person.death_date.slice(0,4)}` : ''}</div>
    {!readOnly && <button className="node-edit" onClick={e => { e.stopPropagation(); onEdit(person); }}>Изменить</button>}
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
const nodeTypes = { person: PersonNode };
type Props = { persons: Person[]; relationships: Relationship[]; onEdit: (p: Person) => void; onConnect: (from: string, to: string, type: 'parent' | 'sibling' | 'spouse' | 'uncle_aunt' | 'niece_nephew') => void; readOnly?: boolean };

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

export default function FamilyCanvas({ persons, relationships, onEdit, onConnect, readOnly = false }: Props) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [type, setType] = useState<'parent' | 'sibling' | 'spouse' | 'uncle_aunt' | 'niece_nephew'>('parent');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PersonNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(persons.map(async p => [p.id, await signedPhotoUrl(p.photo_path)] as const)).then(items => {
      if (!cancelled) setPhotoUrls(Object.fromEntries(items.filter((v): v is readonly [string, string] => Boolean(v[1]))));
    });
    return () => { cancelled = true; };
  }, [persons]);

  useEffect(() => {
    const relationshipEdges: Edge[] = relationships.map(r => ({
      id: r.id, source: r.from_person_id, target: r.to_person_id,
      label: r.type === 'parent' ? 'родитель → ребёнок' : r.type === 'spouse' ? 'супруги' : r.type === 'uncle_aunt' ? 'дядя/тётя' : r.type === 'niece_nephew' ? 'племянник/племянница' : 'брат/сестра',
      type: 'smoothstep', animated: false,
      style: { stroke: r.type === 'spouse' ? '#c084fc' : '#93a4bd', strokeWidth: 2 },
      labelStyle: { fill: 'var(--muted)', fontSize: 10 },
    }));
    setEdges(relationshipEdges);
  }, [relationships, setEdges]);

  useEffect(() => {
    setNodes(current => {
      const existing = new Map(current.map(n => [n.id, n]));
      const baseNodes: Node<PersonNodeData>[] = persons.map(p => {
        const old = existing.get(p.id);
        return {
          id: p.id, type: 'person',
          data: { person: p, photoUrl: photoUrls[p.id] ?? null, onEdit, readOnly },
          position: old?.position ?? { x: 0, y: 0 },
        };
      });
      const laidOut = layoutNodes(baseNodes, edges);
      return laidOut.map(n => existing.has(n.id) ? { ...n, position: existing.get(n.id)!.position } : n);
    });
  }, [persons, photoUrls, onEdit, readOnly, edges, setNodes]);

  const handleConnect = useCallback((connection: Connection) => {
    if (readOnly || !connection.source || !connection.target || connection.source === connection.target) return;
    // A direct drag between node handles uses the currently selected relationship type.
    onConnect(connection.source, connection.target, type);
  }, [readOnly, onConnect, type]);

  return <div className="canvas-wrap">
    {!readOnly && <div className="relationship-toolbar">
      <span className="muted small">Связи как в редакторе нодов:</span>
      <select aria-label="Тип связи для перетаскивания" value={type} onChange={e => setType(e.target.value as typeof type)}><option value="parent">Родитель → ребёнок</option><option value="sibling">Брат / сестра</option><option value="spouse">Супруги</option><option value="uncle_aunt">Дядя / тётя → племянник/племянница</option><option value="niece_nephew">Племянник/племянница → дядя/тётя</option></select>
      <span className="muted small">Перетащите линию от нижнего кружка одной персоны к верхнему кружку другой.</span>
      <span className="muted small">Или добавьте связь вручную:</span>
      <select aria-label="Первая персона" value={source} onChange={e => setSource(e.target.value)}><option value="">От кого…</option>{persons.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      <select aria-label="Вторая персона" value={target} onChange={e => setTarget(e.target.value)}><option value="">С кем…</option>{persons.filter(p => p.id !== source).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      <button className="secondary small-button" disabled={!source || !target || source === target} onClick={() => { onConnect(source, target, type); setSource(''); setTarget(''); }}>Связать</button>
    </div>}
    <div className="canvas">
      {persons.length === 0 ? <div className="empty-canvas"><div className="empty-icon">✳</div><h3>Здесь начнётся ваша история</h3><p>Добавьте первую персону, затем соедините родственников.</p></div> :
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={handleConnect} nodeTypes={nodeTypes} fitView minZoom={0.15} maxZoom={2.2} nodesDraggable={!readOnly} nodesConnectable={!readOnly} edgesReconnectable={false} connectionLineStyle={{ stroke: '#7c8cff', strokeWidth: 2 }} proOptions={{ hideAttribution: true }}>
          <Background color="var(--grid)" gap={22} /><Controls /><MiniMap pannable zoomable nodeColor="var(--accent)" />
        </ReactFlow>}
    </div>
  </div>;
}
