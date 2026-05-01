import { useCallback, useEffect, useState } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) { setUser(null); return; }
      const data = await res.json();
      setUser(data.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = useCallback((returnTo) => {
    let r = returnTo ?? (location.pathname + location.search);
    if (!r.startsWith('/') || r.startsWith('//') || r.startsWith('/api/')) r = '/';
    location.href = `/api/auth/github/login?return_to=${encodeURIComponent(r)}`;
  }, []);

  const signOut = useCallback(() => {
    location.href = '/api/auth/logout';
  }, []);

  return { user, loading, signIn, signOut, refresh };
}
