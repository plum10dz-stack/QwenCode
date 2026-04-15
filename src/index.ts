/// <reference path="../api/database/types/schema.d.ts" />
import { Channel } from "./utils/channels/channel";
import { ISWChannel } from "./utils/channels/ISWChannel";
import "./workspace";

import { remoteObject } from "./utils/networking";
import './utils/types.d.ts';
const swChannel = new Channel(new ISWChannel());
type State = {
    sessionId?: string;
    userId?: string;
    currentStep?: string;
    formData?: Record<string, unknown>;
    apiResponse?: unknown;
    error?: unknown;
};
swChannel.once('yourName', (res) => {
    return 'ACHOUR';
});
swChannel.on('USERID', req => {

    return "achour";
});
swChannel.on('DEMANDE_PASSWORD', req => {

    return "achour"
});
swChannel.on('DEMANDE_USER_ID', req => {

    return "achour"
});



export function main() {

}