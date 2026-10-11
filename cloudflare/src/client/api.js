import { useCallback, useEffect, useState } from "react";
export async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}
export function useResource(path) {
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const result = await api(path);
      setData(result);
      setError(null);
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    api(path)
      .then((value) => {
        if (alive) {
          setData(value);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return { data, error, loading, refresh };
}
