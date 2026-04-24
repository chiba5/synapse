import { getServiceClient } from './supabase';

export async function ensureProfile(email: string) {
  const db = getServiceClient();
  const { data, error } = await db
    .from('profiles')
    .upsert({ email }, { onConflict: 'email' })
    .select('id, email, display_name')
    .single();
  if (error) throw error;
  return data;
}
