import { http } from '../../utils/networking/http';


/**
 * Raw SSE / NDJSON generator that connects to /stream/changes and yields
 * parsed {@link StreamChunk} objects.
 *
 * Protocol: the server may send either:
 *   - Standard SSE:  `data: <JSON>\n\n`
 *   - NDJSON:        `<JSON>\n`
 *
 * Both are handled transparently by stripping the optional "data:" prefix.
 *
 * @param sinceMs  Epoch ms of the last known sync point.
 *                 The server will only send rows with `updated_at > since`.
 * @param signal   Optional AbortSignal to cleanly tear down the connection.
 */
export async function* streamChanges(
    sinceMs: number,
    signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
    const stream = http.fetchStream({
        route: '/stream/changes',
        method: 'GET',
        headers: { since: sinceMs.toString() },
        signal,
    });

    // Buffer for incomplete lines that arrive mid-chunk.
    let buffer = '';

    for await (const { chunk } of stream) {
        if (signal?.aborted) break;

        // Normalise: chunk is either a raw string (text/* content-type) or an
        // already-parsed object. Streaming text is expected here.
        buffer += typeof chunk === 'string' ? chunk : JSON.stringify(chunk);

        // Split on newlines; the last element is either empty or a partial line.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep incomplete tail for next iteration

        for (const raw of lines) {
            const line = raw.trim();

            // Skip SSE keep-alive comments and blank lines.
            if (!line || line.startsWith(':')) continue;

            // Strip optional "data: " SSE prefix.
            const json = line.startsWith('data:') ? line.slice(5).trim() : line;

            try {
                const parsed = JSON.parse(json) as StreamChunk;
                // Guard: only yield valid chunks that carry a table name.
                if (parsed && typeof parsed.table === 'string') {
                    yield {
                        table: parsed.table,
                        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
                        deletes: Array.isArray(parsed.deletes) ? parsed.deletes : [],
                        time: typeof parsed.time === 'number' ? parsed.time : Date.now(),
                    };
                }
            } catch {
                // Malformed line — log in dev, skip in production.
                if (typeof (self as any).__DEV__ !== 'undefined') {
                    console.warn('[streamChanges] malformed chunk:', json);
                }
            }
        }
    }
}
