import { describe, expect, it } from "vitest";
import { InterruptNode } from "./interrupt-node";
import { type RunConfig } from "./types";

describe("InterruptNode", () => {
    it("should interrupt when being called without a resumeFrom", async () => {
        const node = new InterruptNode<{ count: number }>();
        const config: RunConfig = { shouldInterrupt: false };
        await node.run({ count: 0 }, config);
        expect(config.shouldInterrupt).toBe(true);
    });

    it("should not interrupt when being called with a resumeFrom", async () => {
        const node = new InterruptNode<{ count: number }>();
        const config: RunConfig = {
            resumeFrom: ["nodeA"],
            shouldInterrupt: false,
        };
        await node.run({ count: 0 }, config);
        expect(config.shouldInterrupt).toBe(false);
    });
});
