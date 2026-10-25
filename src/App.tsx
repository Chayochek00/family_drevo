import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Auth from './components/Auth';
import PersonForm from './components/PersonForm';
import FamilyCanvas from './components/FamilyCanvas';
import PhotosGallery from './components/PhotosGallery';
import ShareTree from './components/ShareTree';
import { friendlyError } from './lib/errors';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { FamilyTree, Person, Relationship, RelationshipType } from './types';

type Toast = { message: string; kind: 'success' | 'error' } | null;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [trees, setTrees] = useState<FamilyTree[]>([]);
  const [treeId, setTreeId] = useState('');
  const [persons, setPersons] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [editing, setEditing] = useState<Person | null | undefined>(undefined);
  const [toast, setToast] = useState<Toast>(null);
  const [newTreeName, setNewTreeName] = useState('');
  const [showNewTree, setShowNewTree] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('family-theme') === 'dark');
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'tree' | 'photos' | 'share'>('tree');

  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('family-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadTrees = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const { data, error } = await supabase.from('family_trees').select('id,name,created_at').order('created_at', { ascending: true });
    if (error) throw error;
    const list = (data ?? []) as FamilyTree[];
    setTrees(list);
    setTreeId(current => list.some(t => t.id === current) ? current : list[0]?.id ?? '');
  }, [session]);

  const loadTreeData = useCallback(async () => {
    if (!supabase || !treeId) { setPersons([]); setRelationships([]); return; }
    const [p, r] = await Promise.all([
      supabase.from('persons').select('*').eq('tree_id', treeId).order('created_at'),
      supabase.from('relationships').select('*').eq('tree_id', treeId),
    ]);
    if (p.error) throw p.error;
    if (r.error) throw r.error;
    setPersons((p.data ?? []) as Person[]);
    setRelationships((r.data ?? []) as Relationship[]);
  }, [treeId]);

  useEffect(() => {
    if (!session) { setTrees([]); setTreeId(''); setPersons([]); setRelationships([]); return; }
    loadTrees().catch(e => notify(friendlyError(e), 'error'));
  }, [session, loadTrees, notify]);

  useEffect(() => { loadTreeData().catch(e => notify(friendlyError(e), 'error')); }, [loadTreeData, notify]);

  async function createTree(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !newTreeName.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('family_trees').insert({ name: newTreeName.trim() }).select('id').single();
      if (error) throw error;
      setNewTreeName(''); setShowNewTree(false);
      await loadTrees(); setTreeId(data.id); notify('Семейное древо создано.');
    } catch (e) { notify(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  }

  async function deleteTree() {
    if (!supabase || !treeId) return;
    const tree = trees.find(t => t.id === treeId);
    if (!tree || !window.confirm(`Удалить древо «${tree.name}» вместе со всеми персонами? Это действие нельзя отменить.`)) return;
    try {
      const { error } = await supabase.from('family_trees').delete().eq('id', treeId);
      if (error) throw error;
      notify('Древо удалено.'); await loadTrees();
    } catch (e) { notify(friendlyError(e), 'error'); }
  }

  async function connect(from: string, to: string, type: RelationshipType) {
    if (!supabase || !treeId) return;
    // For parent relations, from_person_id is the parent and to_person_id is the child.
    const exists = relationships.some(r => r.from_person_id === from && r.to_person_id === to && r.type === type);
    if (exists) return notify('Такая связь уже существует.', 'error');
    try {
      const { error } = await supabase.from('relationships').insert({ tree_id: treeId, from_person_id: from, to_person_id: to, type });
      if (error) throw error;
      await loadTreeData(); notify('Родственная связь добавлена.');
    } catch (e) { notify(friendlyError(e), 'error'); }
  }

  async function deletePerson(person: Person) {
    if (!supabase || !window.confirm(`Удалить персону «${person.first_name} ${person.last_name ?? ''}»?`)) return;
    try {
      const { error } = await supabase.from('persons').delete().eq('id', person.id);
      if (error) throw error;
      await loadTreeData(); notify('Персона удалена.');
    } catch (e) { notify(friendlyError(e), 'error'); }
  }

  if (!isSupabaseConfigured) return <main className="setup-shell"><section className="setup-card"><div className="brand-mark">✳</div><p className="eyebrow">НАСТРОЙКА ПРОЕКТА</p><h1>Почти готово!</h1><p>Добавьте параметры Supabase в файл <code>.env</code>. Подробная инструкция находится в README.md.</p><pre>VITE_SUPABASE_URL=https://…supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=ваш_publishable_или_anon_ключ</pre><p className="muted small">Не используйте service_role или secret key во frontend.</p></section></main>;
  if (authLoading) return <div className="loading-screen"><div className="spinner" />Загружаем семейную историю…</div>;
  if (!session) return <Auth notify={notify} />;

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href={import.meta.env.BASE_URL}><span className="brand-mark small-mark">✳</span><span>Семейное древо</span></a>
      <div className="top-actions"><span className="user-email">{session.user.email}</span><button className="icon-button" title="Переключить тему" onClick={() => setDark(v => !v)}>{dark ? '☀' : '☾'}</button><button className="secondary" onClick={() => supabase?.auth.signOut()}>Выйти</button></div>
    </header>
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-title"><div><p className="eyebrow">ВАШ АРХИВ</p><h2>Мои деревья</h2></div><button className="icon-button accent-icon" onClick={() => setShowNewTree(v => !v)} title="Создать древо">＋</button></div>
        {showNewTree && <form className="new-tree-form" onSubmit={createTree}><input autoFocus value={newTreeName} onChange={e => setNewTreeName(e.target.value)} placeholder="Название древа" maxLength={100} required /><button className="primary" disabled={busy}>Создать</button></form>}
        <div className="tree-list">
          {trees.map(tree => <button key={tree.id} className={tree.id === treeId ? 'tree-item selected' : 'tree-item'} onClick={() => setTreeId(tree.id)}><span className="tree-symbol">⌘</span><span className="tree-label">{tree.name}<small>{tree.id === treeId ? `${persons.length} персон` : 'Семейное древо'}</small></span><span className="tree-arrow">›</span></button>)}
          {trees.length === 0 && !showNewTree && <div className="empty-sidebar"><span>⌘</span><p>У вас пока нет деревьев.</p><button className="text-button" onClick={() => setShowNewTree(true)}>Создать первое →</button></div>}
        </div>
        {trees.length > 0 && <button className="delete-tree" onClick={deleteTree}>Удалить выбранное древо</button>}
        <div className="sidebar-note"><span>✦</span><p>Каждая семейная история заслуживает своего места.</p></div>
      </aside>
      <section className="main-panel">
        {!treeId ? <div className="welcome-empty"><div className="empty-icon">✳</div><h2>Начните с семейного древа</h2><p>Создайте древо, чтобы добавить родственников и соединить поколения.</p><button className="primary" onClick={() => setShowNewTree(true)}>＋ Создать древо</button></div> : <>
          <div className="page-heading"><div><p className="eyebrow">ВАША ИСТОРИЯ · {persons.length} ПЕРСОН</p><h1>{trees.find(t => t.id === treeId)?.name ?? 'Семейное древо'}</h1><p className="muted">Соедините поколения и сохраните истории близких.</p></div>{activeTab === 'tree' && <button className="primary add-person" onClick={() => setEditing(null)}>＋ Добавить персону</button>}</div>
          <nav className="feature-tabs" aria-label="Разделы дерева"><button className={activeTab==='tree'?'active':''} onClick={()=>setActiveTab('tree')}>Семейное древо</button><button className={activeTab==='photos'?'active':''} onClick={()=>setActiveTab('photos')}>Фотографии</button><button className={activeTab==='share'?'active':''} onClick={()=>setActiveTab('share')}>Поделиться деревом</button></nav>
          {activeTab === 'photos' ? <PhotosGallery treeId={treeId} userId={session.user.id} persons={persons} notify={notify} /> : activeTab === 'share' ? <ShareTree treeId={treeId} treeName={trees.find(t => t.id === treeId)?.name ?? 'Семейное древо'} persons={persons} notify={notify} /> : <>
          <div className="canvas-card"><div className="canvas-heading"><div><h3>Карта семьи</h3><p className="muted small">Перетаскивайте холст, меняйте масштаб. Дважды щёлкните по карточке для редактирования.</p></div><span className="status-pill"><span /> Сохранение в облаке</span></div>
            <FamilyCanvas persons={persons} relationships={relationships} onEdit={p => setEditing(p)} onConnect={connect} />
          </div>
          <div className="people-section"><div className="section-heading"><div><h2>Люди в древе</h2><p className="muted small">Нажмите на карточку, чтобы открыть её данные.</p></div><span className="count-pill">{persons.length}</span></div>
            {persons.length === 0 ? <div className="empty-people"><div className="empty-icon">＋</div><h3>Создайте первую персону</h3><p>Начните с себя, родителей или любого родственника.</p><button className="primary" onClick={() => setEditing(null)}>Добавить персону</button></div> :
              <div className="people-grid">{persons.map(p => <article className="person-card" key={p.id} onClick={() => setEditing(p)}><div className="person-card-top"><div className="person-initial">{p.first_name.slice(0,1).toUpperCase()}</div><button className="delete-person-icon" title="Удалить персону" aria-label={`Удалить ${p.first_name}`} onClick={e => { e.stopPropagation(); deletePerson(p); }}>🗑</button></div><h3>{p.first_name} {p.patronymic ? `${p.patronymic} ` : ''}{p.last_name}</h3><p className="muted small">{p.birth_date || 'Дата рождения не указана'}{p.death_date ? ` — ${p.death_date}` : ''}</p>{p.birth_place && <p className="muted small">⌖ {p.birth_place}</p>}<span className="edit-hint">Открыть карточку ↗</span></article>)}</div>}
          </div>
          </>}
        </>}
      </section>
    </main>
    {editing !== undefined && treeId && <PersonForm treeId={treeId} userId={session.user.id} person={editing} onClose={() => setEditing(undefined)} onSaved={loadTreeData} notify={notify} />}
    {toast && <div className={`toast ${toast.kind}`} role="status"><span>{toast.kind === 'success' ? '✓' : '!'}</span>{toast.message}<button onClick={() => setToast(null)} aria-label="Закрыть">×</button></div>}
  </div>;
}
