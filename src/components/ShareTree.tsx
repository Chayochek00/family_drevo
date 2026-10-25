import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import FamilyCanvas from './FamilyCanvas';
import type { Person, Relationship } from '../types';

type SharedPhoto = { id: string; person_id: string | null; photo_path: string; caption: string; photo_date: string | null; url?: string | null };
type SharedData = { name: string; persons: Person[]; relationships: Relationship[]; photos: SharedPhoto[] };
type Props = { treeId: string; treeName: string; persons: Person[]; notify: (message: string, kind?: 'success' | 'error') => void };

export default function ShareTree({ treeId, treeName, persons, notify }: Props) {
  const [name, setName] = useState(treeName);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookupName, setLookupName] = useState('');
  const [lookupKey, setLookupKey] = useState('');
  const [shared, setShared] = useState<SharedData | null>(null);
  const [viewTab, setViewTab] = useState<'tree' | 'people' | 'photos'>('tree');

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) return;
    if (key.trim().length < 6) { notify('Ключ доступа должен содержать не менее 6 символов.', 'error'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('set_tree_share', { p_tree_id: treeId, p_share_name: name.trim(), p_access_key: key });
      if (error) throw error;
      notify('Доступ к дереву настроен. Передайте название и ключ только тем, кому доверяете.');
    } catch (e) { notify(friendlyError(e), 'error'); } finally { setBusy(false); }
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setShared(null);
    try {
      const { data, error } = await supabase.rpc('get_shared_tree', { p_share_name: lookupName.trim(), p_access_key: lookupKey });
      if (error) throw error;
      if (!data) throw new Error('Дерево не найдено или название/ключ неверны.');
      const d = data as SharedData;
      setShared({ name: d.name, persons: d.persons ?? [], relationships: d.relationships ?? [], photos: d.photos ?? [] });
      setViewTab('tree');
    } catch (e) { notify(friendlyError(e), 'error'); } finally { setBusy(false); }
  }

  function photoUrl(path: string) {
    if (!supabase) return '';
    return supabase.storage.from('family-photos').getPublicUrl(path).data.publicUrl;
  }

  return <section className="feature-page">
    <h2>Поделиться деревом</h2>
    <p className="muted small">Создайте название и ключ доступа. Гости смогут просматривать древо, карточки персон и фотоальбом, но не смогут изменять данные.</p>
    <form className="share-form" onSubmit={save}>
      <h3>Моё дерево</h3>
      <label>Название для доступа<input value={name} onChange={e => setName(e.target.value)} maxLength={100} required /></label>
      <label>Ключ доступа (не менее 6 символов)<input value={key} onChange={e => setKey(e.target.value)} minLength={6} required autoComplete="new-password" /></label>
      <button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить доступ'}</button>
      <p className="muted small">Используйте отдельный ключ, не совпадающий с паролем от почты.</p>
    </form>

    <div className="share-form">
      <h3>Посмотреть чужое дерево</h3>
      <form className="form-stack" onSubmit={lookup}>
        <label>Название дерева<input value={lookupName} onChange={e => setLookupName(e.target.value)} required /></label>
        <label>Ключ доступа<input value={lookupKey} onChange={e => setLookupKey(e.target.value)} required /></label>
        <button className="secondary" disabled={busy}>{busy ? 'Проверяем…' : 'Открыть дерево'}</button>
      </form>
    </div>

    {shared && <section className="shared-full-page" aria-label="Чужое семейное древо">
      <header className="shared-page-header">
        <div><p className="eyebrow">ГОСТЕВОЙ ДОСТУП · ТОЛЬКО ПРОСМОТР</p><h2>{shared.name}</h2><p className="muted small">{shared.persons.length} персон · {shared.photos.length} фотографий</p></div>
        <button className="secondary" onClick={() => setShared(null)}>Закрыть дерево</button>
      </header>
      <nav className="feature-tabs" aria-label="Навигация чужого дерева">
        <button className={viewTab === 'tree' ? 'active' : ''} onClick={() => setViewTab('tree')}>Семейное древо</button>
        <button className={viewTab === 'people' ? 'active' : ''} onClick={() => setViewTab('people')}>Персоны ({shared.persons.length})</button>
        <button className={viewTab === 'photos' ? 'active' : ''} onClick={() => setViewTab('photos')}>Фотографии ({shared.photos.length})</button>
      </nav>
      {viewTab === 'tree' && <div className="canvas-card"><div className="canvas-heading"><div><h3>Карта семьи</h3><p className="muted small">Можно перемещать холст и менять масштаб. Редактирование отключено.</p></div><span className="status-pill"><span /> Только просмотр</span></div><FamilyCanvas persons={shared.persons} relationships={shared.relationships} onEdit={() => undefined} onConnect={() => undefined} readOnly /></div>}
      {viewTab === 'people' && <div className="people-grid">{shared.persons.map(p => <article className="person-card" key={p.id}><div className="person-card-top">{p.photo_path ? <img className="person-initial" src={photoUrl(p.photo_path)} alt="" /> : <div className="person-initial">{p.first_name.slice(0, 1).toUpperCase()}</div>}</div><h3>{p.first_name} {p.patronymic ? `${p.patronymic} ` : ''}{p.last_name}</h3><p className="muted small">{p.birth_date || 'Дата рождения не указана'}{p.death_date ? ` — ${p.death_date}` : ''}</p>{p.birth_place && <p className="muted small">⌖ {p.birth_place}</p>}{p.biography && <p>{p.biography}</p>}</article>)}</div>}
      {viewTab === 'photos' && (shared.photos.length ? <div className="gallery-grid">{shared.photos.map(photo => <article className="gallery-card" key={photo.id}><img src={photoUrl(photo.photo_path)} alt={photo.caption || 'Семейная фотография'} /><div className="gallery-info"><strong>{photo.caption || 'Без описания'}</strong><p className="muted small">{photo.photo_date || 'Дата не указана'}{photo.person_id ? ` · ${shared.persons.find(p => p.id === photo.person_id)?.first_name ?? ''}` : ''}</p></div></article>)}</div> : <div className="empty-people"><h3>В этом альбоме пока нет фотографий</h3></div>)}
    </section>}
  </section>;
}
