import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_LANGUAGE_PAIR, type LanguagePair } from '@package/shared';
import { getLanguagePair, setLanguagePair, subscribeLanguagePair } from './storage';

export function useLanguagePair() {
  const [pair, setPair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const writing = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let changed = false;
    const unsubscribe = subscribeLanguagePair(next => {
      changed = true;
      revision.current += 1;
      setPair(next);
      setReady(true);
      setError(null);
    });
    void getLanguagePair().then(saved => {
      if (!active || changed) return;
      setPair(saved);
      setReady(true);
    }).catch(() => {
      if (active && !changed) setError('Could not load language settings. Reopen this window to try again.');
    });
    return () => {
      active = false;
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  const changePair = useCallback(async (next: LanguagePair) => {
    if (writing.current) return false;
    writing.current = true;
    const version = revision.current;
    setSaving(true);
    setError(null);
    try {
      const saved = await setLanguagePair(next);
      if (mounted.current && revision.current === version) setPair(saved);
      return true;
    } catch {
      if (mounted.current) setError('Could not save language settings. Try selecting the languages again.');
      return false;
    } finally {
      writing.current = false;
      if (mounted.current) setSaving(false);
    }
  }, []);

  return { pair, ready, saving, error, changePair };
}
