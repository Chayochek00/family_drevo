import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { signedPhotoUrl } from '../lib/image';
import { friendlyError } from '../lib/errors';
import type { Person } from '../types';

type Photo = { id: string; tree_id: string; person_id: string | null; photo_path: string; caption: string; photo_date: string | null; created_at: string };
type Props = { treeId: string; userId: string; persons: Person[]; notify: (message: string, kind?: 'success' | 'error') => void };
export default function PhotosGallery({ treeId, userId, persons, notify }: Props) {
  const [photos, setPhotos] = useState<(Photo & { url: string | null })[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [personId, setPersonId] = useState('');
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('tree_photos').select('*').eq('tree_id', treeId).order('photo_date', { ascending: false, nullsFirst: false });
    if (error) throw error;
    const list = await Promise.all(((data ?? []) as Photo[]).map(async p => ({ ...p, url: await signedPhotoUrl(p.photo_path) })));
    setPhotos(list);
  }
  useEffect(() => { load().catch(e => notify(friendlyError(e), 'error')); }, [treeId]);
  async function addPhoto(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !file) return;
    setBusy(true);
    try {
      if (!file.type.startsWith('image/')) throw new Error('Выберите файл изображения.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Размер фото должен быть не более 10 МБ.');
      const path = `${userId}/gallery/${crypto.randomUUID()}`;
      const { error: uploadError } = await supabase.storage.from('family-photos').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from('tree_photos').insert({ tree_id: treeId, person_id: personId || null, photo_path: path, caption: caption.trim(), photo_date: date || null });
      if (error) throw error;
      setFile(null); setCaption(''); setDate(''); setPersonId(''); await load(); notify('Фотография добавлена.');
    } catch (e) { notify(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  }
  async function remove(photo: Photo) {
    if (!supabase || !window.confirm('Удалить эту фотографию?')) return;
    const { error } = await supabase.from('tree_photos').delete().eq('id', photo.id);
    if (error) { notify(friendlyError(error), 'error'); return; }
    await supabase.storage.from('family-photos').remove([photo.photo_path]); await load(); notify('Фотография удалена.');
  }
  return <section className="feature-page"><div className="section-heading"><div><h2>Фотографии</h2><p className="muted small">Общий фотоальбом семейного древа с датами и описаниями.</p></div><span className="count-pill">{photos.length}</span></div>
    <form className="photo-add-form" onSubmit={addPhoto}><label>Фотография<input type="file" accept="image/*" required onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><label>К кому относится<select value={personId} onChange={e => setPersonId(e.target.value)}><option value="">Без привязки к персоне</option>{persons.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.patronymic ? p.patronymic+' ' : ''}{p.last_name}</option>)}</select></label><label>Дата фотографии<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>Описание<input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Например, семейная встреча" maxLength={300} /></label><button className="primary" disabled={busy || !file}>{busy ? 'Загружаем…' : 'Добавить фото'}</button></form>
    {photos.length ? <div className="gallery-grid">{photos.map(photo => <article className="gallery-card" key={photo.id}>{photo.url ? <img src={photo.url} alt={photo.caption || 'Семейная фотография'} /> : <div className="gallery-placeholder">Фото недоступно</div>}<div className="gallery-info"><strong>{photo.caption || 'Без описания'}</strong><p className="muted small">{photo.photo_date || 'Дата не указана'}{photo.person_id ? ` · ${persons.find(p => p.id === photo.person_id)?.first_name ?? ''}` : ''}</p><button className="delete-person-icon" onClick={() => remove(photo)} aria-label="Удалить фото">▤ Удалить</button></div></article>)}</div> : <div className="empty-people"><h3>Пока нет фотографий</h3><p>Добавьте первое фото, укажите дату и подпишите событие.</p></div>}
  </section>;
}
