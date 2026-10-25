export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/invalid login credentials/i.test(message)) return 'Неверный email или пароль.';
  if (/email not confirmed/i.test(message)) return 'Подтвердите email по ссылке из письма.';
  if (/user already registered/i.test(message)) return 'Этот email уже зарегистрирован.';
  if (/password.*6 characters|weak password/i.test(message)) return 'Пароль слишком короткий. Используйте не менее 6 символов.';
  if (/fetch|network|failed to connect/i.test(message)) return 'Не удалось подключиться. Проверьте интернет и настройки Supabase.';
  if (/row-level security|permission denied/i.test(message)) return 'Доступ запрещён политикой безопасности. Проверьте SQL-миграцию Supabase.';
  return message || 'Что-то пошло не так. Попробуйте ещё раз.';
}