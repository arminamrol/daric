import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The token of a mailed link (`?token=`), read once and then dropped from the
 * address bar, so it stays out of browser history and Referer headers.
 */
export function useLinkToken(): string {
  const [params, setParams] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  useEffect(() => {
    if (params.has('token')) setParams({}, { replace: true });
  }, [params, setParams]);
  return token;
}
