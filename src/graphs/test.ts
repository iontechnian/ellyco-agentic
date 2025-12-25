import { makeNode } from "../nodes";
import { Iterator } from "./iterator";
import { NodeSequence } from "./node-sequence";
import { z } from "zod";

const schema = z.object({
    numbers: z.array(z.number()),
});

const iterate = new Iterator(schema, "num", (state) => state.numbers);
const loopedSchema = iterate.getNodeSchema();
const sequence = new NodeSequence(loopedSchema);
sequence.next(makeNode((state) => ({ numItem: state.numItem + 1 })));