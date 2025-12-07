import { describe, expect, it } from "vitest";
import { FunctionNode, makeNode } from "./function-node";

type state = { count: number };

describe("FunctionNode", () => {
    it("should properly implement the passed function as a node", async () => {
        const node = new FunctionNode<state>((state) => ({
            count: state.count + 1,
        }));
        const result = await node.run({ count: 0 }, {});
        expect(result).toEqual({ count: 1 });
    });
});

describe("makeNode", () => {
    it("should properly create a node from a function", async () => {
        const node = makeNode<state>((state) => ({ count: state.count + 1 }));
        const result = await node.run({ count: 0 }, {});
        expect(result).toEqual({ count: 1 });
    });
});
