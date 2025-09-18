import { useEffect, useState } from 'react';

import { getSupabaseBrowserClient } from './supabase-browser';

import type { Session } from '@supabase/supabase-js';

export type UseSessionResult = {
  session: Session | null;
  loading: boolean;
  error: string | null;
};

export async function getSession(): Promise<Session | null> {
  if (typeof window !== 'undefined') {
    throw new Error('getSession can only be invoked on the server.');
  }

  const { getSupabaseServerClient } = await import('./supabase-server');
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Failed to retrieve Supabase session:', error);
    return null;
  }

  return data.session ?? null;
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseBrowserClient();

    supabase.auth
      .getSession()
      .then(({ data, error: getSessionError }) => {
        if (!isMounted) {
          return;
        }

        if (getSessionError) {
          console.error('Failed to fetch initial Supabase session:', getSessionError);
          setError(getSessionError.message);
        } else {
          setError(null);
        }

        setSession(data?.session ?? null);
        setLoading(false);
      })
      .catch((cause) => {
        if (!isMounted) {
          return;
        }

        console.error('Unexpected Supabase session fetch error:', cause);
        setError(cause instanceof Error ? cause.message : 'Unknown error');
        setLoading(false);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setLoading(false);
      setError(null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading, error };
}
