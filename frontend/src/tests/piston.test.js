import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeCode } from "../lib/piston";

describe("executeCode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an error for an unsupported language", async () => {
    const result = await executeCode("ruby", 'puts "hello"');
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported language");
  });

  it("calls the Piston API and returns output on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: { output: "hello\n", stderr: "" } }),
    });

    const result = await executeCode("python", 'print("hello")');
    expect(result.success).toBe(true);
    expect(result.output).toBe("hello\n");
  });

  it("returns an error when stderr is non-empty", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        run: { output: "", stderr: "NameError: name 'x' is not defined" },
      }),
    });

    const result = await executeCode("python", "print(x)");
    expect(result.success).toBe(false);
    expect(result.error).toContain("NameError");
  });

  it("returns an error when the HTTP response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const result = await executeCode("javascript", "console.log(1)");
    expect(result.success).toBe(false);
    expect(result.error).toContain("429");
  });

  it("returns an error when fetch throws (network failure)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await executeCode("java", "class A {}");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to execute code");
  });
});

