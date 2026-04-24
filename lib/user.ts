import { headers } from 'next/headers';

export async function getCurrentEmail(): Promise<string> {
  const hdrs = await headers();
  const email = hdrs.get('x-user-email');
  if (!email) throw new Error('Not authenticated');
  return email;
}
