
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";
import { ERPHelper } from "../../database/adapters/ErpHelper";

compileAPIS({
    // Standard paginated fetch of the aggregated stock view
    '/inventory/:page': {
        async GET(packet: Packet) {
            const page = parseInt(packet.params.page) || 1;

            // There is no dedicated RPC for full table pagination, so we securely read the view
            return packet.requestAndValidate('v_products_stock', {
                employee: "admin",
                admin: ({ req }) => req
                    .select('*')
                    .order('name', { ascending: true })
                    .range((page - 1) * 100, (page * 100) - 1)
            });

        }
    },

    // Quick filter check for stock alerts using RPC
    '/inventory/alerts/:status': {
        async GET(packet: Packet) {
            const status = packet.params.status;

            if (status === 'LOW_STOCK') {
                // Using exactly the generated RPC function for low stock!
                const erp = new ERPHelper(packet.db);
                const lowStockRows = await erp.lowStockList();
                return packet.json(lowStockRows, 200);
            }

            // Fallback for OUT_OF_STOCK, IN_STOCK since our RPC only handles the critical low_stock
            return packet.requestAndValidate('v_products_stock', {
                employee: "admin",
                admin: ({ req }) => req
                    .select('*')
                    .eq('stock_status', status)
                    .order('name', { ascending: true })
            });

        }
    },

    // Total valuation widget using RPC Dashboard Summary
    '/inventory/valuation': {
        async GET(packet: Packet) {
            const erp = new ERPHelper(packet.db);
            const summary = await erp.dashboardSummary();

            if (ERPHelper.isErr(summary)) return packet.json(summary, 500);

            return packet.json({ gross_inventory_value: summary.inventory_value }, 200);
        }
    }
});
