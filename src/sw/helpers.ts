/// <reference path="../../api/database/types/schema.d.ts" />
import { http } from "../utils/networking";
(self as any)['test'] = async (route: string = "/products") => {
    http.callAPI({ route: route, method: "GET" }).then((res: any) => {
        console.log(res);
        return res;
    }).catch((e: any) => {
        console.log(e);
    });
}