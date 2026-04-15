import { initERPServices } from "./Services";
import { erpQueue, ERPQueue } from "./ERPQueue";

/**
 * Bootstraps the AutoHTTP system.
 * This should be called once at application startup.
 */
export function initAutoHTTP() {
    console.log("[AutoHTTP] System Initializing...");
    initERPServices();
    console.log("[AutoHTTP] ERP Services registered.");
}

export { erpQueue, ERPQueue };
export * from "./Services";
export * from "./ERPQueue";
