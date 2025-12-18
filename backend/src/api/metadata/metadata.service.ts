import { getLinkPreview } from 'link-preview-js';
import dns from 'node:dns';

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
];

// Extracts the first URL from a string, if any.
export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

export async function getLinkPreviewWithSafety(text: string) {
  const url = extractFirstUrl(text);
  if (!url) {
    return null;
  }

  try {
    const data = await getLinkPreview(url, {
      timeout: 3000,
      headers: {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept-Language': 'en-US,en;q=0.9',
      },

      resolveDNSHost: (url: string) => {
        return new Promise((resolve, reject) => {
          try{
            const hostname = new URL(url).hostname;
            dns.lookup(hostname, (err, address) => {
              if (err) {
                return reject(err);
              }
              // The library itself will reject private IPs.
              // See: https://github.com/ospfranco/link-preview-js/blob/a751A5A9/src/index.ts#L43
              resolve(address);
            });
          } catch (e) {
            reject(e);
          }
        });
      },

      followRedirects: 'manual',
      handleRedirects: (baseURL: string, forwardedURL: string) => {
        try {
          const base = new URL(baseURL);
          const forwarded = new URL(forwardedURL);

          // Allow redirects only on the same hostname (or from root to www and vice versa)
          // And only from http to https to prevent security issues.
          if (
            (forwarded.hostname === base.hostname ||
              forwarded.hostname === `www.${base.hostname}` ||
              `www.${forwarded.hostname}` === base.hostname) &&
            forwarded.protocol === 'https:' &&
            base.protocol === 'http:'
          ) {
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
    });
    return data;
  } catch (error) {
    console.error(`[MetadataService] Failed to fetch link preview for ${url}:`, error);
    // Do not throw; failure should not block message flow.
    return null;
  }
}
