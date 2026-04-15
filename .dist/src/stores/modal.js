"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useModalStore = void 0;
const pinia_1 = require("pinia");
exports.useModalStore = (0, pinia_1.defineStore)('modal', {
    state: () => ({
        visible: false,
        type: '', // 'product' | 'supplier' | 'customer' | 'so' | 'po' | 'adjust' | 'category' | 'settings'
        editId: null,
        editData: null,
        prefill: {} // partial data to pre-populate (e.g. product_id for adjust)
    }),
    actions: {
        open(type, editData = null, prefill = {}) {
            this.type = type;
            this.editId = (editData === null || editData === void 0 ? void 0 : editData.id) || null;
            this.editData = editData ? Object.assign({}, editData) : null;
            this.prefill = prefill;
            this.visible = true;
        },
        close() { this.visible = false; },
        afterClose() { this.type = ''; this.editId = null; this.editData = null; this.prefill = {}; }
    }
});
