// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/ui', '@sentry/nuxt/module'],
  css: ['~/assets/main.css'],

  nitro: {
    externals: {
      inline: [],
    },
    moduleSideEffects: ['@prisma/client', '.prisma/client/default'],
    rollupConfig: {
      external: ['@prisma/client', '.prisma/client/default'],
    },
  },

  runtimeConfig: {
    // サーバ専用（公開されない）
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_DISABLED: process.env.SMTP_DISABLED,
    // クライアントにも公開
    public: {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    },
  },

  sentry: {
    org: 'pitamai-technology',
    project: 'maimai-hub',
  },

  sourcemap: {
    client: 'hidden',
  },

  colorMode: {
    preference: 'light',
  },
});
