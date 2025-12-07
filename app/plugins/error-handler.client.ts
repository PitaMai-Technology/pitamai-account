export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    const logData = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      info,
      component: instance?.$options?.name || 'AnonymousComponent',
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };

    // 開発環境ではコンソールに見やすく出力
    console.error('[Client Error]', logData);
  };
});
