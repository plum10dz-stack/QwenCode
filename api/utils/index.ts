export * from "./cryptography";
export * from "./env";
export * from "../middleware/cors.middleware";
export * from "../middleware/decrypt.middleware";
export * from "../middleware/json-body.middleware";
export * from "./packet";
export * from "./md5";

import cookies from './cookies'
export default cookies.SID.bind(cookies);

// export function getSID(req: Request, res: Response, next?: NextFunction) {
//     let sid = req.cookies['x-sid'];
//     sid = sid || setSID(req, res, sid);
//     next && next();
//     return sid;
// }
// export function setSID(req: Request, res: Response, sid = crypto.randomUUID()) {
//     const cookieOptions: CookieOptions = {
//         httpOnly: false,
//         secure: false, signed: true,
//         path: '/',
//         maxAge: 60 * 60 * 24 * 30 * 20,
//         sameSite: 'lax'
//     }
//     res.cookie('x-sid', sid, cookieOptions);
//     if (!req.cookies) req.cookies = {};
//     req.cookies['x-sid'] = sid;
//     cookieParser.signedCookie(sid, process.env.SESSION_SECRET || "SECRETCOOKIE");
//     return sid;
// }