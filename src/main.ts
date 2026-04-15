import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/index'
import '../assets/styles.css';
import { Channel } from './utils/channels/channel';
import { ISWChannel } from "./utils/channels/ISWChannel";
//@ts-ignore
import AppLoader from './components/AppLoader.vue'
//import { initApi } from './data/api'

import "./web/apiServices";
const swChannel = new Channel(new ISWChannel());
swChannel.on('ping', () => {
  return { pong: true };
});
const loaderApp = createApp(AppLoader, { message: 'Opening local database…' })
loaderApp.mount('#app')

// ── Phase 2: build store chain + open IndexedDB (+ optional Supabase sync) ───


async function bootstrap() {

  try {

    //  await initApi()
  } catch (err) {
    console.error('[StockOS] initApi() failed — starting with empty state.', err)
  }

  loaderApp.unmount()

  //@ts-ignore
  const { default: App } = await import('./App.vue')
  const app = createApp(App)
    .use(createPinia())
    .use(router)

  // ── Global error handler ────────────────────────────────────────────────────
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[StockOS] Vue error —', info, err)
    // Import notify lazily to avoid circular dep at module level
    import(<any>'./composables/useNotify.js').then(({ useNotify }) => {
      const { notify } = useNotify()
      notify.error(`Unexpected error: ${(err as any)?.message || err}`, 8000)
    }).catch(() => { })
  }

  app.config.warnHandler = (msg) => {
    //@ts-ignore
    if ((import.meta as any).env.DEV) console.warn('[StockOS]', msg)
  }

  app.mount('#app')
}

bootstrap()