"use strict";
// ========================================== // SmartGraph Pro - Parallel Execution + Type-safe Builder + Plugin System // ==========================================
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartGraph = void 0;
exports.createGraph = createGraph;
// ========================================== // 3. Engine with Parallel Execution // ==========================================
class SmartGraph {
    constructor() {
        this.nodes = {};
        this.maxIterations = 1000;
        this.plugins = [];
    }
    addNode(name, def) { this.nodes[name] = def; return this; }
    usePlugin(plugin) { this.plugins.push(plugin); return this; }
    sleep(ms) {
        return __awaiter(this, void 0, void 0, function* () { if (!ms)
            return; return new Promise(res => setTimeout(res, ms)); });
    }
    execute(startNodes, initialState) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let ctx = { state: structuredClone(initialState), result: null, history: [] };
            let activeNodes = [...startNodes];
            let iterations = 0;
            while (activeNodes.length > 0) {
                if (iterations++ > this.maxIterations) {
                    throw new Error("Max iterations exceeded");
                }
                // Execute nodes in parallel
                yield Promise.all(activeNodes.map((nodeName) => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b, _c, _d;
                    if (!this.nodes[nodeName])
                        return;
                    const node = this.nodes[nodeName];
                    let attempt = 0;
                    let success = false;
                    while (!success) {
                        try {
                            ctx.error = undefined;
                            // Plugins before execution
                            for (const plugin of this.plugins)
                                yield ((_a = plugin.beforeNodeExecution) === null || _a === void 0 ? void 0 : _a.call(plugin, ctx));
                            const response = yield node.executer(ctx, this);
                            ctx.result = response;
                            ctx.history.push({ node: nodeName, state: ctx.state, result: ctx.result });
                            // Plugins after execution
                            for (const plugin of this.plugins)
                                yield ((_b = plugin.afterNodeExecution) === null || _b === void 0 ? void 0 : _b.call(plugin, ctx));
                            success = true;
                        }
                        catch (error) {
                            attempt++;
                            const canRetry = node.retry && attempt < node.retry.attempts && (!node.retry.when || node.retry.when(error));
                            if (canRetry) {
                                yield this.sleep(((_c = node.retry) === null || _c === void 0 ? void 0 : _c.delayMs) || 1000);
                                continue;
                            }
                            ctx.error = error;
                            ctx.history.push({ node: nodeName, state: ctx.state, result: ctx.result, error });
                            for (const plugin of this.plugins)
                                yield ((_d = plugin.onError) === null || _d === void 0 ? void 0 : _d.call(plugin, ctx, error));
                            const errorEdge = node.edges.find(e => e.type === "error");
                            if (errorEdge) {
                                activeNodes.push(errorEdge.target);
                                success = true;
                                break;
                            }
                            throw error;
                        }
                    }
                })));
                // Determine next nodes from edges
                const nextActive = [];
                for (const nodeName of activeNodes) {
                    const node = this.nodes[nodeName];
                    for (const edge of node.edges) {
                        if (edge.type === "result" || edge.type === void 0 && ctx.result === edge.value)
                            nextActive.push(edge.target);
                        if (edge.type === "state" && ((_a = ctx.event) === null || _a === void 0 ? void 0 : _a.type) === edge.value)
                            nextActive.push(edge.target);
                        if (edge.type === "condition" && (yield edge.fn(ctx, this)))
                            nextActive.push(edge.target);
                    }
                }
                activeNodes = [...new Set(nextActive)]; // remove duplicates
            }
            return ctx.result;
        });
    }
}
exports.SmartGraph = SmartGraph;
// ========================================== // 4. Type-safe Graph Builder // ==========================================
function createGraph(config) { const graph = new SmartGraph(); for (const [name, def] of Object.entries(config)) {
    graph.addNode(name, def);
} return graph; }
