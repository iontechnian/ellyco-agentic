import { ModelMessages } from "../messages";
import { BaseModel, StructuredOutputWrapper } from "../models/BaseModel";
import { NodeLike } from "./types";
import { ContextLayer } from "../graphs/runtime-context";
import { TypedKeys } from "../types";
import { z } from "zod";

function isMessagesFunction<T extends Record<string, unknown>>(value: any): value is (state: T, context: ContextLayer) => ModelMessages[] {
    return typeof value === "function";
}

type MessagesKeys<T> = TypedKeys<T, ModelMessages[]>;

interface ConstructedMessages<T extends Record<string, unknown>> {
    messages: (state: T, context: ContextLayer) => ModelMessages[];
}

interface MessagesPath<T> {
    messages: MessagesKeys<T>;
}

type ModelNodeSettings<T extends Record<string, unknown>> =
    { output: keyof T }
    & (ConstructedMessages<T> | MessagesPath<T>);

export class ModelNode<T extends Record<string, unknown>> implements NodeLike<T> {
    constructor(
        private readonly model: BaseModel | StructuredOutputWrapper<any>,
        private readonly settings: ModelNodeSettings<T>,
    ) { }

    async run(state: T, context: ContextLayer): Promise<Partial<T>> {
        let messages: ModelMessages[] = [];
        if (isMessagesFunction(this.settings.messages)) {
            messages = this.settings.messages(state, context);
        } else {
            const stateMessages = state[this.settings.messages as keyof T];
            if (!stateMessages || !Array.isArray(stateMessages)) {
                throw new Error(`No Messages array found for key ${this.settings.messages as string}`);
            }
            messages = stateMessages as ModelMessages[];
        }
        if (this.model instanceof StructuredOutputWrapper) {
            const output = await this.model.invoke(messages);
            return { [this.settings.output]: output } as Partial<T>;
        }
        const response = await this.model.invoke(messages);
        return { [this.settings.output]: response.messages } as Partial<T>;
    }
}
