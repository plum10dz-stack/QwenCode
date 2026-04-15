// ========================================== // SmartGraph Pro - Parallel Execution + Type-safe Builder + Plugin System // ==========================================

// ========================================== // 1. Type-safe Node Keys & Config Builder // ==========================================

export type NodeName = string;

export interface AppEvent { type: string; payload?: unknown; }

export type NodeResponse<S, R> = R|void;// { state: S; result: R; }

export interface ExecutionContext<S, R> {
    state: S; result: R | null|void;
    event?: AppEvent;
    error?: unknown;
    history: Array<{ node: NodeName; state: S; result: R | null|void; error?: unknown }>;
}

export type AsyncExecuter<S, R, G> = (ctx: ExecutionContext<S, R>, graph: G) => Promise<NodeResponse<S, R>|void> | NodeResponse<S, R>;

export type AsyncCondition<S, R, G> = (ctx: ExecutionContext<S, R>, graph: G) => Promise<boolean> | boolean;

export type Edge<S, R, G> =
    { type?: "result" | void; value: R; target: NodeName } |
    { type: "state"; value: string; target: NodeName } |
    { type: "condition"; fn: AsyncCondition<S, R, G>; target: NodeName } |
    { type: "error"; target: NodeName };

export interface RetryPolicy { attempts: number; delayMs?: number; when?: (error: unknown) => boolean; }

export interface NodeDefinition<S, R, G> { executer: AsyncExecuter<S, R, G>; edges: Edge<S, R, G>[]; retry?: RetryPolicy; }

//export interface RawGraphConfig<S, R, K extends NodeName> { [nodeName in K]: NodeDefinition<S, R, SmartGraph<S, R>>; }
export type RawGraphConfig<S, R, K extends NodeName> =
    Record<K, NodeDefinition<S, R, SmartGraph<S, R>>>;
// ========================================== // 2. Plugin System // ==========================================

export interface GraphPlugin<S, R> { beforeNodeExecution?: (ctx: ExecutionContext<S, R>) => void | Promise<void>; afterNodeExecution?: (ctx: ExecutionContext<S, R>) => void | Promise<void>; onError?: (ctx: ExecutionContext<S, R>, error: unknown) => void | Promise<void>; }

// ========================================== // 3. Engine with Parallel Execution // ==========================================

export class SmartGraph<S, R> {
    public nodes: Record<NodeName, NodeDefinition<S, R, SmartGraph<S, R>>> = {}; private maxIterations = 1000; private plugins: GraphPlugin<S, R>[] = [];

    public addNode(name: NodeName, def: NodeDefinition<S, R, SmartGraph<S, R>>): this { this.nodes[name] = def; return this; }

    public usePlugin(plugin: GraphPlugin<S, R>): this { this.plugins.push(plugin); return this; }

    public async sleep(ms?: number) { if (!ms) return; return new Promise(res => setTimeout(res, ms)); }

    public async execute(startNodes: NodeName[], initialState: S): Promise<NodeResponse<S, R | null>> {
        let ctx: ExecutionContext<S, R> = { state: structuredClone(initialState), result: null, history: [] };

        let activeNodes = [...startNodes];
        let iterations = 0;

        while (activeNodes.length > 0) {
            if (iterations++ > this.maxIterations) {
                throw new Error("Max iterations exceeded");
            }

            // Execute nodes in parallel
            await Promise.all(activeNodes.map(async nodeName => {
                if (!this.nodes[nodeName]) return;
                const node = this.nodes[nodeName];
                let attempt = 0;
                let success = false;

                while (!success) {
                    try {
                        ctx.error = undefined;

                        // Plugins before execution
                        for (const plugin of this.plugins) await plugin.beforeNodeExecution?.(ctx);

                        const response = await node.executer(ctx, this);
                        ctx.result = response;

                        ctx.history.push({ node: nodeName, state: ctx.state, result: ctx.result });

                        // Plugins after execution
                        for (const plugin of this.plugins) await plugin.afterNodeExecution?.(ctx);

                        success = true;

                    } catch (error) {
                        attempt++;
                        const canRetry = node.retry && attempt < node.retry.attempts && (!node.retry.when || node.retry.when(error));
                        if (canRetry) {
                            await this.sleep(node.retry?.delayMs || 1000);
                            continue;
                        }

                        ctx.error = error;
                        ctx.history.push({ node: nodeName, state: ctx.state, result: ctx.result, error });

                        for (const plugin of this.plugins) await plugin.onError?.(ctx, error);

                        const errorEdge = node.edges.find(e => e.type === "error");
                        if (errorEdge) {
                            activeNodes.push(errorEdge.target);
                            success = true;
                            break;
                        }

                        throw error;
                    }
                }
            }));

            // Determine next nodes from edges
            const nextActive: NodeName[] = [];
            for (const nodeName of activeNodes) {
                const node = this.nodes[nodeName];
                for (const edge of node.edges) {
                    if (edge.type === "result" || edge.type === void 0 && ctx.result === edge.value) nextActive.push(edge.target);
                    if (edge.type === "state" && ctx.event?.type === edge.value) nextActive.push(edge.target);
                    if (edge.type === "condition" && await edge.fn(ctx, this)) nextActive.push(edge.target);
                }
            }
            activeNodes = [...new Set(nextActive)]; // remove duplicates
        }

        return ctx.result;

    }
}

// ========================================== // 4. Type-safe Graph Builder // ==========================================

export function createGraph<S, R, K extends NodeName>(config: RawGraphConfig<S, R, K>): SmartGraph<S, R> { const graph = new SmartGraph<S, R>(); for (const [name, def] of Object.entries(config)) { graph.addNode(name, def as NodeDefinition<S, R, SmartGraph<S, R>>); } return graph; }
