export class ContextLayer {
    public currentNode?: string;
    public custom: Record<string, any> = {};

    constructor(
        public readonly id: string,
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

    unwrapCursor(cursor: string): void {
        this._resuming = true;
        const layers = cursor.split(".");
        let idPrefix = "";
        for (const layer of layers) {
            const contextLayer = new ContextLayer(
                idPrefix.length > 0 ? idPrefix : "ROOT",
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

    nextLayer(): ContextLayer {
        // already a contextLayer present at this depth
        if (this.currentLayer < this.contextLayers.length - 1) {
            const layer = this.contextLayers[this.currentLayer + 1]!;
            this.currentLayer++;
            return layer;
        }
        const contextLayer = new ContextLayer(
            this.nextLayerId(),
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

    private nextLayerId(): string {
        if (this.currentLayer === -1) {
            return "ROOT";
        }
        const currentLayer = this.contextLayers[this.currentLayer]!;
        return `${currentLayer.id}.${currentLayer.currentNode!}`;
    }
}
