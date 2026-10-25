import { useEffect, useState, useCallback } from 'react';
import { Background, Controls, MiniMap, ReactFlow, Handle, Position, useNodesState, useEdgesState, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react';
import dagre from 'dagre';
import type { Person, Relationship } from '../types';
import { signedPhotoUrl } from '../lib/image';

type PersonNodeData = { person: Person; photoUrl: string | null; onEdit: (p: Person) => void; onDelete: (p: Person) => void; onNodeContextMenu: (p: Person) => void; readOnly?: boolean };
function PersonNode({ data }: NodeProps<Node<PersonNodeData>>) {
  const { person, photoUrl, onEdit, onDelete, onNodeContextMenu, readOnly = false } = data;
  const fullName = `${person.first_name} ${person.last_name ?? ''}`.trim();
  return <div className="person-node" onContextMenu={e => { if (readOnly) return; e.preventDefault(); e.stopPropagation(); onNodeContextMenu(person); }} onDoubleClick={() => { if (!readOnly) onEdit(person); }} title={readOnly ? 'Только просмотр' : 'Двойной щелчок — редактировать; ПКМ — управление связями'}>
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
  const [showAllRelationships, setShowAllRelationships] = useState(false);
  const [contextPerson, setContextPerson] = useState<Person | null>(null);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
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
      label: r.type === 'parent' ? 'родитель → ребёнок' : r.type === 'spouse' ? 'супруги · ●' : r.type === 'uncle_aunt' ? 'дядя/тётя' : r.type === 'niece_nephew' ? 'племянник/племянница' : 'брат/сестра',
      labelShowBg: true, labelBgStyle: { fill: 'var(--panel)', fillOpacity: 0.94 }, labelBgPadding: [5, 3], labelBgBorderRadius: 4,
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
          data: { person: p, photoUrl: photoUrls[p.id] ?? null, onEdit, onDelete, onNodeContextMenu: setContextPerson, readOnly },
          position: old?.position ?? { x: 0, y: 0 },
        };
      });
      const laidOut = layoutNodes(baseNodes, edges);
      return laidOut.map(n => existing.has(n.id) ? { ...n, position: existing.get(n.id)!.position } : n);
    });
  }, [persons, relationships, photoUrls, onEdit, readOnly, edges, setNodes]);

  const handleConnect = useCallback((connection: Connection) => {
    if (readOnly || !connection.source || !connection.target || connection.source === connection.target) return;
    setPendingConnection(connection);
  }, [readOnly]);

  const confirmConnection = () => {
    if (!pendingConnection?.source || !pendingConnection.target) return;
    onConnect(pendingConnection.source, pendingConnection.target, type, pendingConnection.sourceHandle ?? 'source-bottom', pendingConnection.targetHandle ?? 'target-top');
    setPendingConnection(null);
  };

  return <div className={`canvas-wrap${fullscreen ? ' canvas-fullscreen' : ''}`}>
    {!readOnly && <div className="relationship-toolbar">
      <span className="muted small">Связи как в редакторе нодов:</span>
      <select aria-label="Тип связи для перетаскивания" value={type} onChange={e => setType(e.target.value as typeof type)}><option value="parent">Родитель → ребёнок</option><option value="sibling">Брат / сестра</option><option value="spouse">Супруги</option><option value="uncle_aunt">Дядя / тётя → племянник/племянница</option><option value="niece_nephew">Племянник/племянница → дядя/тётя</option></select>
      <span className="muted small">Потяните соединитель одной персоны к другой — после соединения выберите родственную связь. На линии супругов в центре отмечена общая точка для семейной связи.</span>
      <span className="muted small">Или добавьте связь вручную:</span>
      <select aria-label="Первая персона" value={source} onChange={e => setSource(e.target.value)}><option value="">От кого…</option>{persons.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      <select aria-label="Вторая персона" value={target} onChange={e => setTarget(e.target.value)}><option value="">С кем…</option>{persons.filter(p => p.id !== source).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>
      <label className="side-select">Откуда <select value={sourceSide} onChange={e => setSourceSide(e.target.value as typeof sourceSide)}><option value="source-top">Сверху</option><option value="source-bottom">Снизу</option></select></label><label className="side-select">Куда <select value={targetSide} onChange={e => setTargetSide(e.target.value as typeof targetSide)}><option value="target-top">Сверху</option><option value="target-bottom">Снизу</option></select></label><button className="secondary small-button" disabled={!source || !target || source === target} onClick={() => { onConnect(source, target, type, sourceSide, targetSide); setSource(''); setTarget(''); }}>Связать</button>
      <div className={`relationship-list${showAllRelationships ? ' expanded' : ' collapsed'}`}><div className="relationship-list-heading"><strong>Все связи ({relationships.length})</strong><button className="secondary small-button" onClick={() => setShowAllRelationships(v => !v)}>{showAllRelationships ? 'Свернуть' : 'Развернуть'}</button></div>{showAllRelationships && (relationships.length === 0 ? <span className="muted small">Связей пока нет.</span> : relationships.map(r => <div className="relationship-row" key={r.id}><span>{persons.find(p => p.id === r.from_person_id)?.first_name ?? 'Персона'} ↔ {persons.find(p => p.id === r.to_person_id)?.first_name ?? 'Персона'}</span><select aria-label="Изменить тип связи" value={r.type} onChange={e => onUpdateRelationship(r.id, e.target.value as RelationType)}><option value="parent">Родитель → ребёнок</option><option value="sibling">Брат / сестра</option><option value="spouse">Супруги</option><option value="uncle_aunt">Дядя / тётя</option><option value="niece_nephew">Племянник / племянница</option></select><button className="danger-small" onClick={() => onDeleteRelationship(r.id)}>Удалить связь</button></div>))}</div>
      <div className="canvas-help muted small">Подсказка: наведите курсор на линию, чтобы увидеть тип родства. ПКМ по ноде открывает список её связей — их можно удалять по одной. Удаление самой персоны доступно кнопкой «Удалить» на ноде. Двойной щелчок — редактирование.</div>
    </div>}
    <div className="canvas" onClick={() => setContextPerson(null)}><button className="canvas-fullscreen-toggle secondary" onClick={() => setFullscreen(v => !v)}>{fullscreen ? '⤢ Выйти из полного экрана' : '⛶ На весь экран'}</button>
      {contextPerson && !readOnly && <div className="node-relationship-menu" onClick={e => e.stopPropagation()}><div className="node-relationship-menu-heading"><strong>Связи: {contextPerson.first_name} {contextPerson.last_name ?? ''}</strong><button className="icon-button" onClick={() => setContextPerson(null)} aria-label="Закрыть">×</button></div>{relationships.filter(r => r.from_person_id === contextPerson.id || r.to_person_id === contextPerson.id).length === 0 ? <p className="muted small">У этой персоны пока нет связей.</p> : relationships.filter(r => r.from_person_id === contextPerson.id || r.to_person_id === contextPerson.id).map(r => <div className="node-relationship-menu-row" key={r.id}><span>{persons.find(p => p.id === (r.from_person_id === contextPerson.id ? r.to_person_id : r.from_person_id))?.first_name ?? 'Персона'} · {r.type === 'parent' ? 'родитель → ребёнок' : r.type === 'sibling' ? 'брат / сестра' : r.type === 'spouse' ? 'супруги' : r.type === 'uncle_aunt' ? 'дядя / тётя' : 'племянник / племянница'}</span><button className="danger-small" onClick={() => { onDeleteRelationship(r.id); setContextPerson(null); }}>Удалить связь</button></div>)}</div>}
      {persons.length === 0 ? <div className="empty-canvas"><div className="empty-icon">✳</div><h3>Здесь начнётся ваша история</h3><p>Добавьте первую персону, затем соедините родственников.</p></div> :
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={handleConnect} nodeTypes={nodeTypes} fitView minZoom={0.15} maxZoom={2.2} nodesDraggable={!readOnly} nodesConnectable={!readOnly} edgesReconnectable={!readOnly} deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']} connectionLineStyle={{ stroke: '#7c8cff', strokeWidth: 2 }} proOptions={{ hideAttribution: true }}>
          <Background color="var(--grid)" gap={22} /><Controls /><MiniMap pannable zoomable nodeColor="var(--accent)" />
        </ReactFlow>}
    </div>
    {pendingConnection && !readOnly && <div className="modal-backdrop" role="presentation"><div className="modal-card connection-modal" role="dialog" aria-modal="true" aria-labelledby="connection-title"><div className="modal-heading"><div><h2 id="connection-title">Выберите родственную связь</h2><p className="muted small">Соединение создано. Укажите, кем эти люди приходятся друг другу.</p></div><button className="icon-button" onClick={() => setPendingConnection(null)} aria-label="Закрыть">×</button></div><label>Тип родства<select value={type} onChange={e => setType(e.target.value as typeof type)}><option value="parent">Родитель → ребёнок</option><option value="sibling">Брат / сестра</option><option value="spouse">Супруги</option><option value="uncle_aunt">Дядя / тётя → племянник/племянница</option><option value="niece_nephew">Племянник/племянница → дядя/тётя</option></select></label><div className="modal-actions"><button className="secondary" onClick={() => setPendingConnection(null)}>Отмена</button><button className="primary" onClick={confirmConnection}>Создать связь</button></div></div></div>}
  </div>;
}
