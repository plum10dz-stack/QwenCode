"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
/// <reference path="../api/database/types/schema.d.ts" />
const channel_1 = require("./utils/channels/channel");
const ISWChannel_1 = require("./utils/channels/ISWChannel");
require("./workspace");
require("./utils/types.d.ts");
const swChannel = new channel_1.Channel(new ISWChannel_1.ISWChannel());
swChannel.once('yourName', (res) => {
    return 'ACHOUR';
});
swChannel.on('USERID', req => {
    return "achour";
});
swChannel.on('DEMANDE_PASSWORD', req => {
    return "achour";
});
swChannel.on('DEMANDE_USER_ID', req => {
    return "achour";
});
function main() {
}
