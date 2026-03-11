import path from 'node:path';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  vite: () => ({
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@core': path.resolve(__dirname, 'src/core'),
      },
    },
  }),

  manifest: ({ browser }) => ({
    name: '__MSG_EXTENSION_NAME__',
    description: '__MSG_EXTENSION_DESCRIPTION__',
    version: '1.0.0',
    default_locale: 'en',

    permissions: [
      'activeTab',
      'tabs',
      ...(browser !== 'firefox' && browser !== 'opera' ? (['sidePanel'] as const) : []),
    ],

    commands: {
      'toggle-picker': {
        suggested_key: { default: 'Ctrl+Shift+X', mac: 'Command+Shift+X' },
        description: '__MSG_COMMAND_TOGGLE_PICKER__',
      },
    },

    ...(browser !== 'firefox' &&
      browser !== 'opera' && {
        side_panel: {
          default_path: 'popup.html?sidepanel=1',
        },
      }),

    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },

    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },

    ...(browser === 'chrome' && {
      minimum_chrome_version: '116',
    }),

    ...(browser === 'edge' && {
      minimum_chrome_version: '116',
    }),

    ...(browser === 'opera' && {
      minimum_chrome_version: '116',
      sidebar_action: {
        default_panel: 'popup.html?sidepanel=1',
        default_title: '__MSG_EXTENSION_NAME__',
        default_icon: {
          16: 'icons/16.png',
          32: 'icons/32.png',
        },
      },
    }),

    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'xpath-helper@xpath-helper.com',
          strict_min_version: '142.0',
        },
      },
      sidebar_action: {
        default_panel: 'popup.html?sidepanel=1',
        default_title: '__MSG_EXTENSION_NAME__',
        default_icon: {
          16: 'icons/16.png',
          32: 'icons/32.png',
        },
      },
    }),
  }),

  browser: 'chrome',
});
