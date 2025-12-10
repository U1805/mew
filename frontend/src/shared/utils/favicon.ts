const ORIGINAL_FAVICON_URL = '/favicon.svg';

/**
 * Generates a new favicon with a notification count.
 * @param count The number of unread messages. If 0, returns the original favicon.
 * @returns A promise that resolves to a data URL of the new favicon.
 */
export const generateFavicon = (count: number): Promise<string> => {
  return new Promise((resolve) => {
    if (count === 0) {
      resolve(ORIGINAL_FAVICON_URL);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) {
      resolve(ORIGINAL_FAVICON_URL); // Fallback if context is not supported
      return;
    }

    const img = new Image();
    img.src = ORIGINAL_FAVICON_URL;

    img.onload = () => {
      // Draw the original favicon
      context.drawImage(img, 0, 0, 32, 32);

      // --- Draw the notification badge ---
      const text = count > 99 ? '99+' : count.toString();
      const badgeRadius = 8;
      const badgeX = canvas.width - badgeRadius - 1; // Position at top-right
      const badgeY = canvas.height - badgeRadius - 1;

      // Red circle
      context.beginPath();
      context.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      context.fillStyle = '#f00'; // Red color
      context.fill();

      // Text inside the circle
      context.fillStyle = 'white'; // White text
      context.font = 'bold 12px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, badgeX, badgeY + 1);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      // Fallback if the original favicon fails to load
      resolve(ORIGINAL_FAVICON_URL);
    };
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