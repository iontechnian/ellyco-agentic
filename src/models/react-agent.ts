import { ModelMessages, ToolRequest, ToolResponse } from "../messages";
import { ToolImplementation } from "../tools";
import { cloneAware } from "../util";
import { BaseModel } from "./BaseModel";

export class ReActAgent {
    invokeLoopLimit = 10;
    private readonly toolMap = new Map<string, ToolImplementation<any, any, any>>();

    constructor(private readonly model: BaseModel, private readonly tools: ToolImplementation<any, any, any>[]) {
        for (const tool of tools) {
            this.toolMap.set(tool.name, tool);
        }
    }

    // starts from the provided messages, and keeps running the agent until the response doesn't include tool calls
    async invoke(messages: ModelMessages[], additionalArgs?: Record<string, any>) {
        let allMessage: ModelMessages[] = cloneAware(messages);
        this.model.withTools(this.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            schema: tool.schema,
        })));
        let loopCount = 0;
        while (loopCount < this.invokeLoopLimit) {
            ++loopCount;
            const response = await this.model.invoke(allMessage, additionalArgs);
            const toolRequests = response.messages.filter(message => message instanceof ToolRequest);
            if (toolRequests.length === 0) {
                return response;
            }
            allMessage = [...allMessage, ...response.messages] as ModelMessages[];
            for (const toolRequest of toolRequests) {
                const tool = this.toolMap.get(toolRequest.toolName);
                if (!tool) {
                    throw new Error(`Tool ${toolRequest.toolName} not found. This should not happen as all tools would be specified`);
                }
                const toolResponse = await tool.func(toolRequest.input, additionalArgs);
                allMessage.push(new ToolResponse(toolRequest.toolUseId, toolRequest.toolName, toolResponse));
            }
        }
        throw new Error("ReActAgent loop limit reached without agent resolution.");
    }
}