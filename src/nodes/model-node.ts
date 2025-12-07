import { BaseMessage, ToolUse } from "../messages";
import { BaseModel } from "../models";
import { NodeLike, RunConfig } from "./types";

interface ConstructedMessages<T extends object> {
    messages: (state: T) => (BaseMessage | ToolUse)[];
    output: string;
}

interface MessagesPath {
    messages: string;
    output?: string;
}

type ModelNodeSettings<T extends object> =
    | ConstructedMessages<T>
    | MessagesPath;

export class ModelNode<T extends object> implements NodeLike<T> {
    constructor(
        private readonly model: BaseModel,
        private readonly settings: ModelNodeSettings<T>,
    ) {}

    async run(state: T, config: RunConfig): Promise<Partial<T>> {
        return state;
    }
}
