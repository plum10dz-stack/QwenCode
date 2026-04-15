"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastChannel = void 0;
const channel_1 = require("./channel");
const ISWChannel_1 = require("./ISWChannel");
const CHANNEL_NAME = 'flow-db';
exports.broadcastChannel = new channel_1.Channel(new ISWChannel_1.IBroadcastChannel(CHANNEL_NAME));
