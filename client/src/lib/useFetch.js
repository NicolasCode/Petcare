import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useFetch(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const reload = useCallback(() => {
    if (!url) return Promise.resolve();
    return api
      .get(url)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState((s) => ({ data: s.data, error, loading: false })));
  }, [url]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    reload();
  }, [reload]);

  return { ...state, reload, setData: (fn) => setState((s) => ({ ...s, data: fn(s.data) })) };
}
