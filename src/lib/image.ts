import imageCompression from 'browser-image-compression';
import { BUCKET, supabase } from './supabase';

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

export async function uploadPersonPhoto(file: File, userId: string, personId: string): Promise<string> {
  if (!supabase) throw new Error('Сначала настройте Supabase.');
  if (!file.type.startsWith('image/')) throw new Error('Выберите файл изображения.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Исходное фото должно быть меньше 10 МБ.');

  const compressed = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1400,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
  const path = `${userId}/${personId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  // Bucket is private: save only the path; create a signed URL when displaying.
  return path;
}

export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}