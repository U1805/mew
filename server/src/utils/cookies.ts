export const readCookie = (cookieHeader: string | undefined, name: string): string | null => {
  const raw = cookieHeader;
  if (!raw) return null;
  const parts = raw.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
};

