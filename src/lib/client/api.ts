/** Fetch helper: throws an Error carrying the API's Turkish error message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `İstek başarısız (${res.status})`);
  return body as T;
}

export const postJson = <T,>(url: string, data: unknown, method = "POST") =>
  api<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
