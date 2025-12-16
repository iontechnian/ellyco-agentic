import { describe, expect, it } from "vitest";
import { InterruptNode } from "./interrupt-node";
import { RuntimeContext } from "../graphs";

describe("InterruptNode", () => {
    it("should interrupt when being called without a resumeFrom", async () => {
        const node = new InterruptNode<{ count: number }>();
        const runtime = new RuntimeContext();
        await node.run({ count: 0 }, runtime.nextLayer());
        expect(runtime.interrupted).toBe(true);
    });

    it("should not interrupt when being called with a resumeFrom", async () => {
        const node = new InterruptNode<{ count: number }>();
        const runtime = new RuntimeContext();
        runtime.unwrapCursor("nodeA");
        await node.run({ count: 0 }, runtime.nextLayer());
        expect(runtime.interrupted).toBe(false);
    });
});
