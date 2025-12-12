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
    onRouteDidUpdate() {
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

if (ExecutionEnvironment.canUseDOM) {
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
             if (typeof window.twemoji !== 'undefined') {
                window.twemoji.parse(document.body, {
                    folder: 'svg',
                    ext: '.svg',
                });
            }
        }, 100);
    });
}

export default twemojiClientModule;
