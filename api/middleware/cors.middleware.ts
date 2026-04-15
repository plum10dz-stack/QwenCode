import cors from 'cors';
import { SID } from '../utils/cookies';

const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const corsOptions: cors.CorsOptions = {
    maxAge: 600 * 6 * 24,
    preflightContinue: false,
    exposedHeaders: [SID, 'x-encrypt', 'Content-Type', 'accept-service'],
    // 1. Dynamic Origin Logic
    origin: (origin, callback) => {
        // Allow if no origin (like mobile apps/curl) or if in your list
        // If you want to allow EVERYTHING while supporting credentials, 
        // just use: callback(null, true);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Optional: block origins not in your list
            // callback(new Error('Not allowed by CORS'));

            // Or: reflect the origin anyway (your current logic)
            callback(null, true);
        }
    },

    // 2. Allow Credentials (Cookies/Auth headers)
    credentials: true,

    // 3. Allowed Methods (Replaces your OPTIONS check logic)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],

    // 4. Allowed Custom Headers
    allowedHeaders: [
        SID, 'F-ID',
        'Content-Type',
        'Authorization',
        'x-encrypt',
        'username',

        'handshake',
        'accept-service'
    ],

    // 5. Success Status for Preflight (Some legacy browsers choke on 204)
    optionsSuccessStatus: 200
};
export default cors(corsOptions);
// Use it in your app
