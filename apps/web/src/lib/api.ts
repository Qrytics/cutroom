export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const r = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'content-type': 'application/json', ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((body as { error?: string })?.error || `HTTP ${r.status}`);
  return body as T;
}

export async function uploadFiles(projectId: string, files: File[], me: { id: string; name: string }, onEach?: (name: string) => void) {
  const out = [];
  for (const f of files) {
    onEach?.(f.name);
    const fd = new FormData();
    fd.append('file', f, f.name);
    fd.append('userId', me.id);
    fd.append('userName', me.name);
    out.push(await api(`/api/projects/${projectId}/media`, { method: 'POST', body: fd }));
  }
  return out;
}

export const fmtTime = (t: number, fps?: number) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  const tail = fps ? String(Math.floor((t % 1) * fps)).padStart(2, '0') : String(Math.floor((t % 1) * 100)).padStart(2, '0');
  return `${m}:${String(s).padStart(2, '0')}${fps ? ':' : '.'}${tail}`;
};
