const ORIGINAL_FAVICON_URL = '/favicon.svg';

/**
 * Generates a new favicon with a notification count.
 * @param count The number of unread messages. If 0, returns the original favicon.
 * @returns A promise that resolves to a data URL of the new favicon.
 */
export const generateFavicon = (count: number): Promise<string> => {
  if (count === 0) return Promise.resolve(ORIGINAL_FAVICON_URL);

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) return resolve(ORIGINAL_FAVICON_URL);

    const img = new Image();
    img.src = ORIGINAL_FAVICON_URL;

    img.onload = () => {
      context.drawImage(img, 0, 0, 32, 32);

      const text = count > 99 ? '99+' : count.toString();
      const badgeRadius = 8;
      const badgeX = canvas.width - badgeRadius - 1;
      const badgeY = canvas.height - badgeRadius - 1;

      context.beginPath();
      context.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      context.fillStyle = '#f00';
      context.fill();

      context.fillStyle = 'white';
      context.font = 'bold 12px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, badgeX, badgeY + 1);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => resolve(ORIGINAL_FAVICON_URL);
  });
};

/**
 * Updates the document's favicon.
 * @param url The new URL for the favicon (can be a path or a data URL).
 */
export const updateFavicon = (url: string) => {
  let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");

  if (link) {
    link.href = url;
  } else {
    link = document.createElement('link');
    link.rel = 'icon';
    link.href = url;
    document.getElementsByTagName('head')[0].appendChild(link);
  }
};
