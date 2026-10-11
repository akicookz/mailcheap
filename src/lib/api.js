export async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong");
    error.status = response.status;
    throw error;
  }
  return data;
}
