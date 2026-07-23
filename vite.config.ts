import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [],
        manifest: {
          id: "/dashboard",
          name: "Plugsy",
          short_name: "Plugsy",
          description: "CapCut subscriptions and creative portfolios",
          theme_color: "#EF4444",
          background_color: "#0a0a0a",
          display: "standalone",
          scope: "/",
          start_url: "/dashboard",
          orientation: "portrait",
          gcm_sender_id: "482941778795",
          gcm_user_visible_only: true,
          icons: [
            {
              src: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666215/icon-512_coggae.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666215/icon-maskable-192_y3jp3u.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable"
            },
            {
              src: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666215/icon-maskable-512_gi4py6.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ],
          screenshots: [
            {
              src: "https://res.cloudinary.com/doit6oaze/image/upload/v1783667065/screenshot-wide_kzfnzn.png",
              sizes: "1366x661",
              type: "image/png",
              form_factor: "wide"
            },
            {
              src: "https://res.cloudinary.com/doit6oaze/image/upload/v1783667065/screenshot-mobile_b5kwlr.png",
              sizes: "540x1184",
              type: "image/png"
            }
          ]
        } as any,
        workbox: {
          importScripts: [
            "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js",
            "/onesignal-badge-sw.js"
          ],
          globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
          maximumFileSizeToCacheInBytes: 4000000,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      'process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY': JSON.stringify(env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY),
      'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(env.NEXT_PUBLIC_SITE_URL),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
    },
  };
});
