import { now } from "../help";
import { getPacket, Packet } from "../utils/packet";
import { Request, Response, NextFunction } from "express";
export async function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  // const packet = getPacket(req, res);
  // const method = packet.method;
  // if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
  //   const result = next();

  //   await packet.db.schema("public").from("audit_log").insert({
  //     table_name: packet.params.table,
  //     operation: method,
  //     row_id: packet.params.id || "unknown",
  //     payload: packet.body,
  //     created_at: now(false)
  //   });

  //   return result;
  // }
  return next();
}
