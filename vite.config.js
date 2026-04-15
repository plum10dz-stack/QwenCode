import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import fs from 'fs';

export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: [
      'sos.algeria.com',
      'sos.algeria.com',
      'os.com',
      'os.dz',
    ],
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // https: {
    //   key: fs.readFileSync('keys/os.dz+3-key.pem'),
    //   cert: fs.readFileSync('keys/os.dz+3.pem'),
    //   ca: fs.readFileSync('keys/os.dz+3.pem'),
    //   requestCert: true,
    //   rejectUnauthorized: false,
    //   IncomingMessage: true,
    //   ServerResponse: true,
    //   allowHalfOpen: true,
    //   allowPartialTrustChain: true,
    //   ALPNCallback: true,

    //   ALPNProtocols: true,

    //   blockList: true,

    //   ciphers: true,

    //   connectionsCheckingInterval: true,

    //   crl: true,

    //   dhparam: true,

    //   ecdhCurve: true,

    //   enableTrace: true,

    //   handshakeTimeout: true,

    //   headersTimeout: true,

    //   keepAliveTimeout: true,
    //   highWaterMark: true,
    //   honorCipherOrder: true,
    //   keepAlive: true,
    //   lookup: true,
    //   maxHeaderSize: true,
    //   maxConnections: true,
    //   maxFreeSockets: true,
    //   maxSockets: true,
    //   noDelay: true,
    //   openTimeout: true,
    //   pauseOnConnect: true,
    //   peerCertificate: true,
    //   peerCertificateChain: true,
    //   requestCert: true,
    //   secureContext: true,
    //   secureConnectionOptions: true,
    //   secureOptions: true,
    //   secureServerSessionTimeout: true,
    //   sessionTimeout: true,
    //   insecureHTTPParser: true,
    //   sessionIdContext: true,

    // },
    hmr: {
      host: 'os.dz',
      port: 5173,
    },
    cors: true,
    sameSite: 'none',

    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Expose-Headers': 'Content-Length',
      'Access-Control-Request-Headers': 'Content-Type, Authorization',
      'Access-Control-Request-Method': 'GET, POST, PUT, DELETE, OPTIONS',
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:"


    }

  },

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },



  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          xlsx: ['xlsx'],
          vendor: ['vue', 'vue-router', 'pinia'],
        },
      },
    },

  },
})
