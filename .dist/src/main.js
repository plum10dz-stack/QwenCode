"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vue_1 = require("vue");
const pinia_1 = require("pinia");
const index_1 = __importDefault(require("./router/index"));
require("../assets/styles.css");
const channel_1 = require("./utils/channels/channel");
const ISWChannel_1 = require("./utils/channels/ISWChannel");
//@ts-ignore
const AppLoader_vue_1 = __importDefault(require("./components/AppLoader.vue"));
//import { initApi } from './data/api'
require("./web/apiServices");
const swChannel = new channel_1.Channel(new ISWChannel_1.ISWChannel());
swChannel.on('ping', () => {
    return { pong: true };
});
const loaderApp = (0, vue_1.createApp)(AppLoader_vue_1.default, { message: 'Opening local database…' });
loaderApp.mount('#app');
// ── Phase 2: build store chain + open IndexedDB (+ optional Supabase sync) ───
function bootstrap() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            //  await initApi()
        }
        catch (err) {
            console.error('[StockOS] initApi() failed — starting with empty state.', err);
        }
        loaderApp.unmount();
        //@ts-ignore
        const { default: App } = yield Promise.resolve().then(() => __importStar(require('./App.vue')));
        const app = (0, vue_1.createApp)(App)
            .use((0, pinia_1.createPinia)())
            .use(index_1.default);
        // ── Global error handler ────────────────────────────────────────────────────
        app.config.errorHandler = (err, _instance, info) => {
            console.error('[StockOS] Vue error —', info, err);
            // Import notify lazily to avoid circular dep at module level
            Promise.resolve(`${'./composables/useNotify.js'}`).then(s => __importStar(require(s))).then(({ useNotify }) => {
                const { notify } = useNotify();
                notify.error(`Unexpected error: ${(err === null || err === void 0 ? void 0 : err.message) || err}`, 8000);
            }).catch(() => { });
        };
        app.config.warnHandler = (msg) => {
            //@ts-ignore
            if (import.meta.env.DEV)
                console.warn('[StockOS]', msg);
        };
        app.mount('#app');
    });
}
bootstrap();
