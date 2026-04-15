/// <reference path="./database/types/schema.d.ts" />

// @/api.ts
import "./routes";
import "./utils/env";
import express, { Request, Response } from "express";
import { getPacket } from "./utils/packet";
import jsonParserBody from "./middleware/json-body.middleware";
import cookieParser from "cookie-parser";
import { jsonDecrypter } from "./middleware/decrypt.middleware";
import rateLimit from "express-rate-limit";
import handleCorsAndPreflight from "./middleware/cors.middleware";
import compression from "compression";
import { auditMiddleware } from "./middleware/audit.middleware";

const app = express();
app.use(compression({ threshold: 10, memLevel: 9 }))
app.use(handleCorsAndPreflight);
// app.use(cookieParser(process.env.SESSION_SECRET)).use(rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 10000, // limit each IP to 100 requests per windowMs
//     message: "Too many requests from this IP, please try again after 15 minutes",
// }))
app
    .use(handleCorsAndPreflight)
    .use(jsonParserBody())
    .use(jsonDecrypter)
    .use(auditMiddleware)
    .use(async (req: Request, res: Response) => {
        try {
            const packet = getPacket(req, res);
            const handlerInfo = packet.handler;
            if (handlerInfo) {
                const data = await handlerInfo.handler(packet);
                if (!packet.isClosed) packet.return(data);
            } else {
                packet.validate({ error: 'NOT_FOUND', status: 404 } as any);
            }
        } catch (error) {
            console.error(error);
            res.json({ error: 'INTERNAL_SERVER_ERROR', status: 500 } as any);
            res.end();
        }
    })
    .use(compression({ threshold: 1024 }))
    .listen(process.env.PORT, () => {
        console.log(`API server running at http://localhost:${process.env.PORT}`);
    }).on('error', (err) => {
        console.error(err);
    }).on('close', () => {
        console.log(`API server closed`);
    }).on('listening', () => {
        console.log(`API server listening`);
    }).on('connection', (socket) => {
        console.log(`API server connection`);
    }).on('request', (req, res) => {
        console.log(`API server request`);
    }).on('upgrade', (req, socket, head) => {
        console.log(`API server upgrade`);
    })

app.on("mount", () => {
    console.log("API server mounted");
});
