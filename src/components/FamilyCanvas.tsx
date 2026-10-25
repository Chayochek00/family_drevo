import { useEffect, useState, useCallback } from 'react';
import { Background, Controls, MiniMap, ReactFlow, Handle, Position, useNodesState, useEdgesState, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react';
import dagre from 'dagre';
import type { Person, Relationship } from '../types';
import { signedPhotoUrl } from '../lib/image';

type PersonNodeData = { person: Person; photoUrl: string | null; onEdit: (p: Person) => void; onDelete: (p: Person) => void; readOnly?: boolean };
function PersonNode({ data }: NodeProps<Node<PersonNodeData>>) {
  const { person, photoUrl, onEdit, onDelete, readOnly = false } = data;
  const fullName = `${person.first_name} ${person.last_name ?? ''}`.trim();
  return <div className="person-node" onDoubleClick={() => { if (!readOnly) onEdit(person); }} title={readOnly ? 'Только просмотр' : 'Дважды щёлкните, чтобы редактировать'}>
    <Handle id="target-top" type="target" position={Position.Top} />
    <Handle id="source-top" type="source" position={Position.Top} />
    {photoUrl ? <img className="node-avatar" src={photoUrl} alt="" /> : <div className="node-avatar placeholder">{person.first_name.slice(0,1).toUpperCase()}</div>}
    <div className="node-name">{fullName}</div>
    <div className="node-dates">{person.birth_date?.slice(0,4) ?? '—'}{person.death_date ? ` – ${person.death_date.slice(0,4)}` : ''}</div>
    {!readOnly && <div className="node-actions"><button className="node-edit" onClick={e => { e.stopPropagation(); onEdit(person); }}>Изменить</button><button className="node-delete" onClick={e => { e.stopPropagation(); onDelete(person); }}>Удалить</button></div>}
    <Handle id="target-bottom" type="target" position={Position.Bottom} />
    <Handle id="source-bottom" type="source" position={Position.Bottom} />
  </div>;
}
const nodeTypes = { person: PersonNode };
type RelationType = 'parent' | 'sibling' | 'spouse' | 'uncle_aunt' | 'niece_nephew';
type Props = { persons: Person[]; relationships: Relationship[]; onEdit: (p: Person) => void; onDelete: (p: Person) => void; onConnect: (from: string, to: string, type: RelationType, sourceHandle?: string, targetHandle?: string) => void; onUpdateRelationship: (id: string, type: RelationType) => void; onDeleteRelationship: (id: string) => void; readOnly?: boolean };

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

export default function FamilyCanvas({ persons, relationships, onEdit, onDelete, onConnect, onUpdateRelationship, onDeleteRelationship, readOnly = false }: Props) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [type, setType] = useState<'parent' | 'sibling' | 'spouse' | 'uncle_aunt' | 'niece_nephew'>('parent');
  const [sourceSide, setSourceSide] = useState<'source-top' | 'source-bottom'>('source-bottom');
  const [targetSide, setTargetSide] = useState<'target-top' | 'target-bottom'>('target-top');
  const [fullscreen, setFullscreen] = useState(false);
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
      id: r.id, source: r.from_person_id, target: r.to_person_id, sourceHandle: r.source_handle ?? 'source-bottom', targetHandle: r.target_handle ?? 'target-top',
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
          data: { person: p, photoUrl: photoUrls[p.id] ?? null, onEdit, onDelete, readOnly },
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
    onConnect(connection.source, connection.target, type, connection.sourceHandle ?? 'source-bottom', connection.targetHandle ?? 'target-top');
  }, [readOnly, onConnect, type]);

  return <div className={`canvas-wrap${fullscreen ? ' canvas-fullscreen' : ''}`}>
    {!readOnly && <div className="relationship-toolbar">
      <span className="muted small">Связи как в редакторе нодов:</span>
      <select aria-label="Тип связи для перетаскивания" value={type} onChange={e => setType(e.target.value as typeof type)}><option value="parent">Родитель → ребёнок</option><option value="sibling">Брат / сестра</option><option value="spouse">Супруги</option><option value="uncle_aunt">Дядя / тётя → племянник/племянница</option><option value="niece_nephew">Племянник/племянница → дядя/тётя</option></select>
      <span className="muted small">Тяните линию между кружками сверху или снизу любой персоны.</span>
      <span className="muted small">Или добавьте связь вручную:</span>
      <select aria-label="Первая персона" value={source} onChange={e => setSource(e.target.value)}><option value="">От кого…</option>{persons.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      <select aria-label="Вторая персона" value={target} onChange={e => setTarget(e.target.value)}><option value="">С кем…</option>{persons.filter(p => p.id !== source).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      <label className="side-select">Откуда <select value={sourceSide} onChange={e => setSourceSide(e.target.value as typeof sourceSide)}><option value="source-top">Сверху</option><option value="source-bottom">Снизу</option></select></label><label className="side-select">Куда <select value={targetSide} onChange={e => setTargetSide(e.target.value as typeof targetSide)}><option value="target-top">Сверху</option><option value="target-bottom">Снизу</option></select></label><button className="secondary small-button" disabled={!source || !target || source === target} onClick={() => { onConnect(source, target, type, sourceSide, targetSide); setSource(''); setTarget(''); }}>Связать</button>
      <div className="relationship-list"><strong>Существующие связи</strong>{relationships.length === 0 ? <span className="muted small">Связей пока нет.</span> : relationships.map(r => <div className="relationship-row" key={r.id}><span>{persons.find(p => p.id === r.from_person_id)?.first_name ?? 'Персона'} ↔ {persons.find(p => p.id === r.to_person_id)?.first_name ?? 'Персона'}</span><select aria-label="Изменить тип связи" value={r.type} onChange={e => onUpdateRelationship(r.id, e.target.value as RelationType)}><option value="parent">Родитель → ребёнок</option><option value="sibling">Брат / сестра</option><option value="spouse">Супруги</option><option value="uncle_aunt">Дядя / тётя</option><option value="niece_nephew">Племянник / племянница</option></select><button className="danger-small" onClick={() => onDeleteRelationship(r.id)}>Удалить связь</button></div>)}</div>
    </div>}
    <div className="canvas"><button className="canvas-fullscreen-toggle secondary" onClick={() => setFullscreen(v => !v)}>{fullscreen ? '⤢ Выйти из полного экрана' : '⛶ На весь экран'}</button>
      {persons.length === 0 ? <div className="empty-canvas"><div className="empty-icon">✳</div><h3>Здесь начнётся ваша история</h3><p>Добавьте первую персону, затем соедините родственников.</p></div> :
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={handleConnect} nodeTypes={nodeTypes} fitView minZoom={0.15} maxZoom={2.2} nodesDraggable={!readOnly} nodesConnectable={!readOnly} edgesReconnectable={!readOnly} deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']} connectionLineStyle={{ stroke: '#7c8cff', strokeWidth: 2 }} proOptions={{ hideAttribution: true }}>
          <Background color="var(--grid)" gap={22} /><Controls /><MiniMap pannable zoomable nodeColor="var(--accent)" />
        </ReactFlow>}
    </div>
  </div>;
}
