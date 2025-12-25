import { StoredRun } from "./store/stored-run";

export class ContextLayer {
    public currentNode?: string;
    public custom: Record<string, any> = {};

    get id(): string {
        if (this.index === 0) {
            return "ROOT";
        }
        const lastLayer = this.runtime.getLayer(this.index - 1);
        return `${lastLayer.id}.${lastLayer.currentNode}`;
    }

    constructor(
        public readonly index: number,
        public readonly runtime: RuntimeContext,
    ) { }

    nextLayer(): ContextLayer {
        return this.runtime.nextLayer();
    }

    done(): void {
        if (!this.runtime.interrupted) {
            this.runtime.removeTopLayer();
        }
    }
}

/**
 * The RuntimeContext houses all information other than the state of the graph. This is also shared with sub-graphs.
 */
export class RuntimeContext {
    private readonly contextLayers: ContextLayer[] = [];
    private currentLayer: number = -1;
    private _interrupted = false;
    private _exitMessage = "";
    private _resuming = false;

    get interrupted(): boolean {
        return this._interrupted;
    }
    get exitMessage(): string {
        return this._exitMessage;
    }
    get resuming(): boolean {
        return this._resuming;
    }

    constructor(public readonly runId: string, public readonly storedRun?: StoredRun) { }

    unwrapCursor(cursor: string): void {
        this._resuming = true;
        const layers = cursor.split(".");
        let idPrefix = "";
        for (const layer of layers) {
            const contextLayer = new ContextLayer(
                this.contextLayers.length,
                this,
            );
            contextLayer.currentNode = layer;
            this.contextLayers.push(contextLayer);
            idPrefix = idPrefix.length > 0 ? `${idPrefix}.${layer}` : layer;
        }
    }

    wrapCursor(): string {
        const layerCursors: string[] = [];
        for (const layer of this.contextLayers) {
            layerCursors.push(layer.currentNode!);
        }
        return layerCursors.join(".");
    }

    getLayer(index: number): ContextLayer {
        return this.contextLayers[index]!;
    }

    nextLayer(): ContextLayer {
        // already a contextLayer present at this depth
        if (this.currentLayer < this.contextLayers.length - 1) {
            const layer = this.contextLayers[this.currentLayer + 1]!;
            this.currentLayer++;
            return layer;
        }
        const contextLayer = new ContextLayer(
            this.contextLayers.length,
            this,
        );
        this.contextLayers.push(contextLayer);
        this.currentLayer++;
        return contextLayer;
    }

    removeTopLayer(): void {
        this.contextLayers.pop();
        this.currentLayer--;
    }

    markInterrupted(reason?: string): void {
        this._interrupted = true;
        this._exitMessage = reason ?? "";
    }

    markResumed(): void {
        this._resuming = false;
    }
}
