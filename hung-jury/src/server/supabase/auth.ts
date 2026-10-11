// Resolves the signed-in user for an API route from the Supabase session
// cookie. Every route handler calls this first; a null return means the
// route should respond 401.

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

export interface AuthedUser {
  id: string;
  handle: string;
}

export async function getAuthedUser(): Promise<AuthedUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const userId = await resolveUserId(url, anonKey);
  if (!userId) return null;

  const { getServiceClient } = await import('./client');
  const db = getServiceClient();
  const { data: profile } = await db.from('profiles').select('handle').eq('id', userId).single();
  if (!profile) return null;

  return { id: userId, handle: profile.handle };
}

async function resolveUserId(url: string, anonKey: string): Promise<string | null> {
  // Bearer token path: lets a plain curl (no browser cookie jar) call the
  // API, e.g. the command the seed script prints for the Gate 1 test.
  const headerList = await headers();
  const authHeader = headerList.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    const supabase = createClient(url, anonKey);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    return user?.id ?? null;
  }

  // Browser cookie session path (normal app usage).
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // API routes in this app don't refresh the session cookie; the
        // client SDK handles refresh. No-op here.
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
