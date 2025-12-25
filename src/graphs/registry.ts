import { z } from "zod";

export const STATE_MERGE = z.registry<{ merge: (old: z.$output, change: Partial<z.$output>) => z.$output }>();
