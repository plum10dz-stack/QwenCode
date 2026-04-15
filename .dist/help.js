"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const networking_1 = require("./utils/networking");
self['test'] = () => {
    networking_1.http.callAPI({ route: "/products", method: "GET" }).then((res) => {
        debugger;
        console.log("done");
        return res;
    }).then(console.log).catch((e) => {
        console.log(e);
    });
};
self['test']();
