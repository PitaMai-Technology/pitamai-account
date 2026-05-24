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
    'nuxt-security',
  ],
  css: ['~/assets/main.css'],

  nitro: {
    externals: {
      external: ['@prisma/client', '.prisma/client'],
    },
  },

  routeRules: {
    '/api/**': {
      csurf: false,
    },
    '/api/register-user/register': {
      csurf: true,
    },
  },

  runtimeConfig: {
    // サーバ専用（公開されない）
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    RESEND_DISABLED: process.env.RESEND_DISABLED,
    // クライアントにも公開
    public: {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
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
