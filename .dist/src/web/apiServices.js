"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const broadCastProperies_1 = require("../utils/networking/broadCastProperies");
(0, broadCastProperies_1.buildEventProperty)({
    type: 'string',
    name: 'username',
    ns: '',
    get() {
        return prompt("Username");
    }
});
(0, broadCastProperies_1.buildEventProperty)({
    type: 'string',
    name: 'pwd',
    ns: '',
    get() {
        return prompt("Password");
    }
});
