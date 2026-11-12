import { expect, it } from "vitest";

// C-02 demo only. Never merge this file.
it("fails on purpose so CI blocks the merge (C-02)", () => {
  expect(1).toBe(2);
});
