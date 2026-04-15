import { ALL } from "../EventEmitter";
import { Channel } from "./channel";
import { IBroadcastChannel } from "./ISWChannel";



const CHANNEL_NAME = 'flow-db';

export const broadcastChannel = new Channel(new IBroadcastChannel(CHANNEL_NAME));

