import { useCallback, useState } from 'react';
import { apiErrorMessage } from '../api/client.js';

export function useAsync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (callback) => {
    setLoading(true);
    setError('');

    try {
      return await callback();
    } catch (exception) {
      const message = apiErrorMessage(exception);
      setError(message);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
