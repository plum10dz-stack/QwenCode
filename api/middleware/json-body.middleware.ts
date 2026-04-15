import type { Request, Response, NextFunction } from 'express';

type JsonBodyParserOptions = {
    limit?: number;
    strict?: boolean;
    type?: string[];
};

const DEFAULT_LIMIT = 10 * 1024 * 1024;

function hasBody(req: Request): boolean {
    const transferEncoding = req.headers['transfer-encoding'];
    const contentLength = req.headers['content-length'];

    if (transferEncoding !== undefined) return true;
    if (contentLength !== undefined) {
        const len = Number(contentLength);
        return Number.isFinite(len) && len > 0;
    }

    return false;
}

function jsonBodyParser(options?: JsonBodyParserOptions) {
    const opts = options || {};

    const limit = opts.limit ?? DEFAULT_LIMIT;
    const strict = opts.strict ?? false;

    if (!Number.isInteger(limit) || limit <= 0) {
        throw new TypeError('jsonBodyParser: "limit" must be a positive integer');
    }

    return function jsonBodyParserMiddleware(
        req: Request,
        res: Response,
        next: NextFunction
    ): void {
        if (req.body !== undefined) {
            return next();
        }

        const method = req.method.toUpperCase();
        if (method === 'GET' || method === 'HEAD') {
            req.body = {};
            return next();
        }

        if (!hasBody(req)) {
            req.body = {};
            return next();
        }

        // const contentType = String(req.headers['content-type'] || '');
        // if (!matchesContentType(contentType, allowedTypes)) {
        //   req.body = {};
        //   return next();
        // }

        const chunks: Buffer[] = [];
        let received = 0;
        let done = false;

        const cleanup = () => {
            req.off('data', onData);
            req.off('end', onEnd);
            req.off('error', onError);
            req.off('aborted', onAborted);
        };

        const fail = (status: number, message: string) => {
            if (done) return;
            done = true;
            cleanup();

            if (!res.headersSent) {
                res.status(status).json({ error: message });
            }
        };

        const succeed = (value: unknown) => {
            if (done) return;
            done = true;
            cleanup();
            req.body = value;
            next();
        };

        const onAborted = () => {
            fail(400, 'Request aborted');
        };

        const onError = () => {
            fail(400, 'Error reading request body');
        };

        const onData = (chunk: Buffer) => {
            if (done) return;

            received += chunk.length;
            if (received > limit) {
                fail(413, `Payload too large. Limit is ${limit} bytes.`);
                return;
            }

            chunks.push(chunk);
        };

        const onEnd = () => {
            if (done) return;

            try {
                const raw = Buffer.concat(chunks).toString('utf8');

                if (raw.trim() === '') {
                    return succeed({});
                }

                const parsed = JSON.parse(raw);


                if (strict && (parsed === null || typeof parsed !== 'object')) {
                    return fail(400, 'Invalid JSON body. Expected object or array.');
                }

                succeed(parsed);
            } catch {
                fail(400, 'Invalid JSON');
            }
        };

        req.on('aborted', onAborted);
        req.on('error', onError);
        req.on('data', onData);
        req.on('end', onEnd);
    };
}

export const jsonParser = jsonBodyParser();
export const jsonParserStrict = jsonBodyParser({
    limit: 1 * 1024 * 1024,
    strict: true,
});
export const jsonParserLarge = jsonBodyParser({
    limit: 50 * 1024 * 1024,
});

export default jsonBodyParser;