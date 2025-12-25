import { BaseStore } from "./base-store";

export class StoredRun {
    constructor(public readonly runId: string, private readonly store: BaseStore) {
    }

    async save(cursor: string, state: object): Promise<void> {
        await this.store.save(this.runId, cursor, state);
    }

    async exists(): Promise<boolean> {
        return await this.store.exists(this.runId);
    }

    async load(): Promise<{ cursor: string, state: object }> {
        return await this.store.load(this.runId);
    }

    async delete(): Promise<void> {
        await this.store.delete(this.runId);
    }
}