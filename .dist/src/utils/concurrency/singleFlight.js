"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.singleFlight = singleFlight;
// A wrapper that adds the "Single-Flight" behavior to ANY async function
function singleFlight(fn) {
    let inFlightPromise = null;
    return () => {
        if (inFlightPromise)
            return inFlightPromise;
        inFlightPromise = fn().finally(() => {
            inFlightPromise = null;
        });
        return inFlightPromise;
    };
}
