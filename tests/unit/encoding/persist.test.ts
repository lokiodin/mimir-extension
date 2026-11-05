import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedWriter } from "@/modules/encoding/persist";

describe("createDebouncedWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid schedules into one write of the latest value", () => {
    const write = vi.fn();
    const writer = createDebouncedWriter<string>(write, 250);
    writer.schedule("a");
    vi.advanceTimersByTime(100);
    writer.schedule("ab");
    vi.advanceTimersByTime(100);
    writer.schedule("abc");
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("abc");
  });

  it("flush writes the pending value immediately and only once", () => {
    const write = vi.fn();
    const writer = createDebouncedWriter<string>(write, 250);
    writer.schedule("last edit");
    writer.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("last edit");
    vi.advanceTimersByTime(1_000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending is a no-op", () => {
    const write = vi.fn();
    const writer = createDebouncedWriter<string>(write, 250);
    writer.flush();
    writer.schedule("x");
    vi.advanceTimersByTime(250);
    writer.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });
});
