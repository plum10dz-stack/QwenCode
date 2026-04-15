import { compileAPIS, md5, Packet } from "../../help";
import { } from "@supabase/supabase-js";


compileAPIS({
  GET: {
    async "/stream/changes"(packet: Packet) {
      const { res } = packet;
      let since = Number(packet.query.since || 0);
      const session = await packet.loadSession();
      if (!session) return packet.validate({ error: 'SESSION_NOT_FOUND', status: 401 });
      const x = await packet.keeyAlive(200, "application/json", session)!;
      if (!x) return;
      const interval = setInterval(async () => {
        const cutoff = since;
        const { data, error } = await packet.db
          .from("audit_log")
          .select("*")
          .gt("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(1000) as { data: AuditLogRow[], error: any, statusText: string };

        if (error) {
          console.error(error);
          return;
        }

        if (data?.length) {
          since = data[data.length - 1].created_at;
          x.write(data);
        }
      }, 5000);

      res.on("close", () => clearInterval(interval));
      const promise = new Promise((resl, rej) => {
        res.on("close", () => rej(new Error("Connection closed")));
      });
      return promise;
    }
  }
});