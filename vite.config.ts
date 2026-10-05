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
        includeAssets: ["logo.svg"],
        manifest: {
          id: "/",
          name: "Plugsy",
          short_name: "Plugsy",
          description: "Create, sell, discover and manage digital products, portfolios and payments with Plugsy.",
          theme_color: "#0066ff",
          background_color: "#05070d",
          display: "standalone",
          scope: "/",
          start_url: "/dashboard",
          orientation: "any",
          categories: ["business", "social", "shopping", "productivity"],
          gcm_sender_id: "482941778795",
          gcm_user_visible_only: true,
          icons: [
            {
              src: "/logo.svg",
              sizes: "512x512",
              type: "image/svg+xml",
              purpose: "any"
            },
            {
              src: "/logo.svg",
              sizes: "512x512",
              type: "image/svg+xml",
              purpose: "maskable"
            }
          ],
          shortcuts: [
            { name: "Marketplace", short_name: "Market", url: "/marketplace", icons: [{ src: "/logo.svg", sizes: "512x512", type: "image/svg+xml" }] },
            { name: "Wallet", short_name: "Wallet", url: "/wallet", icons: [{ src: "/logo.svg", sizes: "512x512", type: "image/svg+xml" }] },
            { name: "Messages", short_name: "Chats", url: "/chats", icons: [{ src: "/logo.svg", sizes: "512x512", type: "image/svg+xml" }] }
          ]
        } as any,
        workbox: {
          importScripts: [
            "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js",
            "/onesignal-badge-sw.js"
          ],
          globPatterns: ["**/*.{html,ico,png,svg}", "assets/index-*.css"],
          globIgnores: [
            "icon-192.png",
            "icon-512.png",
            "icon-maskable-192.png",
            "icon-maskable-512.png",
          ],
          maximumFileSizeToCacheInBytes: 4000000,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) => url.origin === self.location.origin && ["script", "style", "worker"].includes(request.destination),
              handler: "StaleWhileRevalidate",
              options: { cacheName: "plugsy-app-assets", expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 } }
            },
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
    build: {
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("@clerk")) return "vendor-clerk";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) return "vendor-motion";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("three") || id.includes("@react-three")) return "vendor-three";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (/node_modules[\\/](?:react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
    },
  };
});
