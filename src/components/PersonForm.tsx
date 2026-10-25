import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { uploadPersonPhoto } from '../lib/image';
import { supabase } from '../lib/supabase';
import type { Person } from '../types';
import { friendlyError } from '../lib/errors';

const schema = z.object({
  first_name: z.string().trim().min(1, 'Введите имя').max(80, 'Максимум 80 символов'),
  last_name: z.string().max(100).optional(),
  patronymic: z.string().max(100).optional(),
  birth_date: z.string().optional(),
  death_date: z.string().optional(),
  birth_place: z.string().max(160).optional(),
  biography: z.string().max(3000, 'Максимум 3000 символов').optional(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']),
}).refine(v => !(v.birth_date && v.death_date) || v.death_date >= v.birth_date, {
  message: 'Дата смерти не может быть раньше даты рождения', path: ['death_date'],
});
type FormValues = z.infer<typeof schema>;

type Props = {
  treeId: string;
  userId: string;
  person?: Person | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (message: string, kind?: 'success' | 'error') => void;
};

export default function PersonForm({ treeId, userId, person, onClose, onSaved, notify }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: person?.first_name ?? '', last_name: person?.last_name ?? '', patronymic: person?.patronymic ?? '',
      birth_date: person?.birth_date ?? '', death_date: person?.death_date ?? '',
      birth_place: person?.birth_place ?? '', biography: person?.biography ?? '',
      gender: person?.gender ?? 'unspecified',
    },
  });
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function save(values: FormValues) {
    if (!supabase) return;
    setBusy(true);
    let personId = person?.id;
    try {
      const payload = {
        tree_id: treeId, first_name: values.first_name.trim(),
        last_name: values.last_name?.trim() || null, patronymic: values.patronymic?.trim() || null,
        birth_date: values.birth_date || null, death_date: values.death_date || null,
        birth_place: values.birth_place?.trim() || null, biography: values.biography?.trim() || null,
        gender: values.gender,
      };
      if (personId) {
        const { error } = await supabase.from('persons').update(payload).eq('id', personId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('persons').insert(payload).select('id').single();
        if (error) throw error;
        personId = data.id;
      }
      if (file && personId) {
        const path = await uploadPersonPhoto(file, userId, personId);
        const { error } = await supabase.from('persons').update({ photo_path: path }).eq('id', personId);
        if (error) throw error;
      }
      notify('Персона сохранена.', 'success');
      await onSaved(); onClose();
    } catch (e) { notify(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="person-title">
      <div className="modal-heading"><div><p className="eyebrow">СЕМЕЙНАЯ ИСТОРИЯ</p><h2 id="person-title">{person ? 'Редактировать персону' : 'Новая персона'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button></div>
      <form className="form-stack" onSubmit={handleSubmit(save)}>
        <div className="form-grid">
          <label>Имя *<input {...register('first_name')} placeholder="Александр" /></label>
          <label>Фамилия<input {...register('last_name')} placeholder="Иванов" /></label>
          <label>Отчество<input {...register('patronymic')} placeholder="Александрович" /></label>
          {errors.first_name && <p className="field-error">{errors.first_name.message}</p>}
          <label>Дата рождения<input type="date" {...register('birth_date')} /></label>
          <label>Дата смерти<input type="date" {...register('death_date')} /></label>
          {errors.death_date && <p className="field-error">{errors.death_date.message}</p>}
          <label>Пол<select {...register('gender')}><option value="unspecified">Не указан</option><option value="male">Мужской</option><option value="female">Женский</option><option value="other">Другой</option></select></label>
          <label>Место рождения<input {...register('birth_place')} placeholder="Город, страна" /></label>
        </div>
        <label>Фотография
          <div className="upload-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
            {preview ? <img className="upload-preview" src={preview} alt="Предпросмотр" /> : <span className="upload-symbol">＋</span>}
            <span>{file ? file.name : 'Перетащите фото сюда или выберите файл'}</span>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <small>JPEG/PNG/WebP, до 10 МБ; сжатие до ~800 КБ перед загрузкой.</small>
          </div>
        </label>
        <label>Краткая биография<textarea rows={4} {...register('biography')} placeholder="Истории, важные события, воспоминания…" /></label>
        {errors.biography && <p className="field-error">{errors.biography.message}</p>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить персону'}</button></div>
      </form>
    </section>
  </div>;
}
