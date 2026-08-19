import { describe, it, expect, vi, afterEach } from "vitest";
import { listServerLayouts, saveNewServerLayout, fetchServerLayout } from "../../src/persistence/serverClient";

afterEach(() => vi.unstubAllGlobals());

describe("serverClient", () => {
  it("lists layouts from GET /api/layouts", async () => {
    const layouts = [{ id: "1", name: "a", updatedAt: "now" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => layouts }));
    expect(await listServerLayouts()).toEqual(layouts);
  });

  it("posts a new layout and returns its summary", async () => {
    const summary = { id: "1", name: "a", updatedAt: "now" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => summary });
    vi.stubGlobal("fetch", fetchMock);
    expect(await saveNewServerLayout("a", [])).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith("/api/layouts", expect.objectContaining({ method: "POST" }));
  });

  it("throws with the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "layout not found" }) }),
    );
    await expect(fetchServerLayout("missing")).rejects.toThrow("layout not found");
  });
});
