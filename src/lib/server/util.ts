export const json = <T>(s: unknown): T => JSON.parse(String(s)) as T;
export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
