import { BaseMessage } from "./message";
import { ToolUse } from "./tool";

export type ModelMessages = BaseMessage | ToolUse;

export * from "./message";
export * from "./tool";
