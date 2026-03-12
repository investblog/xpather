import path from 'node:path';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  // Chrome MV3: strip host_permissions and content_scripts — inject on demand via
  // scripting.executeScript + activeTab, no <all_urls> needed.
  // Firefox MV2: declare content_scripts in manifest for auto-injection — activeTab
  // is not granted from sidebar_action, so on-demand injection fails without host perms.
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      const mutableManifest = manifest as unknown as {
        host_permissions?: unknown;
        content_scripts?: { matches?: string[]; js?: string[]; run_at?: string }[];
        permissions?: string[];
      };
      if (manifest.manifest_version === 3) {
        delete mutableManifest.host_permissions;
        delete mutableManifest.content_scripts;
      } else {
        // Firefox MV2: WXT leaves content_scripts empty for runtime registration.
        // Fill it so the script auto-injects on all http/https pages.
        mutableManifest.content_scripts = [
          {
            matches: ['http://*/*', 'https://*/*'],
            js: ['content-scripts/content.js'],
            run_at: 'document_idle',
          },
        ];
      }
    },
  },

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
      'scripting',
      'webNavigation',
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
          id: 'xpather@xpather.dev',
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
