// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    ...(process.env.NODE_ENV === 'production' ? ['@sentry/nuxt/module'] : []),
    '@nuxt/content',
    '@pinia/nuxt',
    'nuxt-security',
    'nuxt-email-renderer',
  ],
  css: ['~/assets/main.css'],

  nitro: {
    externals: {
      external: ['@prisma/client', '.prisma/client'],
    },
  },

  security: {
    csrf: true,
    rateLimiter: false,
    // 1. Nonce（使い捨てのランダム文字列）生成機能を有効化
    nonce: true,
    headers: {
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'script-src': [
          "'self'",
          "'wasm-unsafe-eval'",
          'https://challenges.cloudflare.com',
          "'nonce-{{nonce}}'",
        ],
        'frame-src': ["'self'", 'https://challenges.cloudflare.com'],
        'worker-src': ["'self'", 'blob:'],
        'connect-src': [
          "'self'",
          'https://challenges.cloudflare.com',
          'https://*.ingest.us.sentry.io',
          'https://*.ingest.sentry.io',
        ],
      },
    },
  },

  routeRules: {
    '/__nuxt_content/**': {
      csurf: false,
    },
    '/api/auth/**': {
      csurf: false,
    },
  },

  runtimeConfig: {
    // サーバ専用（公開されない）
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    TURNSTILE_SECRET_KEY:
      process.env.TURNSTILE_SECRET_KEY ?? process.env.NUXT_TURNSTILE_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    RESEND_DISABLED: process.env.RESEND_DISABLED,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    // クライアントにも公開
    public: {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      TURNSTILE_SITE_KEY:
        process.env.TURNSTILE_SITE_KEY ??
        process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY,
    },
  },

  ...(process.env.NODE_ENV === 'production' ? {
    sentry: {
      org: 'pitamai-technology',
      project: 'auth-server',
    },
  } : {}),

  sourcemap: {
    client: 'hidden',
  },

  colorMode: {
    preference: 'light',
  },
});
