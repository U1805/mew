import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import type { ClientModule } from '@docusaurus/types';

declare global {
  interface Window {
    twemoji?: {
      parse: (element: HTMLElement, options?: any) => void;
    };
  }
}

const twemojiClientModule: ClientModule = {
    // onRouteDidUpdate is not called on the initial page load
    onRouteDidUpdate() {
        // Use a timeout to allow Docusaurus/React to render the new page content
        setTimeout(() => {
            if (ExecutionEnvironment.canUseDOM && typeof window.twemoji !== 'undefined') {
                window.twemoji.parse(document.body, {
                    folder: 'svg',
                    ext: '.svg',
                });
            }
        }, 300);
    },
};

// This code in the module body will run once when the module is imported.
if (ExecutionEnvironment.canUseDOM) {
    // Parse for the first time on initial page load
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
             if (typeof window.twemoji !== 'undefined') {
                window.twemoji.parse(document.body, {
                    folder: 'svg',
                    ext: '.svg',
                });
            }
        }, 500); // 500ms for initial render
    });
}

export default twemojiClientModule;
