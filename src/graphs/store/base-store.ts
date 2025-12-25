import { StoredRun } from "./stored-run";

export abstract class BaseStore {
    abstract save(runId: string, cursor: string, state: object): Promise<void>;
    abstract exists(runId: string): Promise<boolean>;
    abstract load(runId: string): Promise<{ cursor: string, state: object }>;
    abstract delete(runId: string): Promise<void>;

    abstract dispose(): Promise<void>;

    getStoredRun(runId: string): StoredRun {
        return new StoredRun(runId, this);
    }
}