import { describe, expect, it } from "vitest";
import { isEmbedParam } from "@/lib/embed";

describe("isEmbedParam", () => {
  it("turns embed mode on for a bare or truthy param", () => {
    for (const v of ["", "1", "true", "yes"]) expect(isEmbedParam(v)).toBe(true);
  });

  it("leaves it off when absent or explicitly disabled", () => {
    for (const v of [null, "0", "false", "FALSE"]) expect(isEmbedParam(v)).toBe(false);
  });
});
