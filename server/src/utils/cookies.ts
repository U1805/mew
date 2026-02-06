export const readCookie = (cookieHeader: string | undefined, name: string): string | null => {
  const raw = cookieHeader;
  if (!raw) return null;
  const parts = raw.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    const v = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      // Malformed % encoding should not crash the request handler.
      return null;
    }
  }
  return null;
};

