import { getCurrentEmail } from './user';
import { ensureProfile } from './profiles';

export async function getAuth() {
  const email = await getCurrentEmail().catch(() => null);
  if (!email) return null;
  const profile = await ensureProfile(email);
  return { email, profile };
}
