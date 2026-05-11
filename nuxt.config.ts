// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@sentry/nuxt/module',
    '@nuxtjs/mdc',
    '@pinia/nuxt',
  ],
  css: ['~/assets/main.css'],

  build: {
    transpile: ['@prisma/client'],
  },

  nitro: {
    externals: {
      inline: ['@prisma/client', '.prisma/client'],
    },
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    rollupConfig: {
      plugins: [
        {
          name: 'prisma-esm-shim',
          banner() {
            return [
              "import { fileURLToPath as __fileURLToPath } from 'node:url';",
              "import { dirname as __dirname_fn } from 'node:path';",
              'const __filename = __fileURLToPath(import.meta.url);',
              'const __dirname = __dirname_fn(__filename);',
            ].join('\n');
          },
        },
      ],
    },
  },

  runtimeConfig: {
    // サーバ専用（公開されない）
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    RESEND_DISABLED: process.env.RESEND_DISABLED,
    // クライアントにも公開
    public: {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
    },
  },

  sentry: {
    org: 'pitamai-technology',
    project: 'auth-server',
  },

  sourcemap: {
    client: 'hidden',
  },

  colorMode: {
    preference: 'light',
  },
});
