// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServerSyncPanel } from "../../src/ui/serverSyncPanel";
import * as serverClient from "../../src/persistence/serverClient";

describe("ServerSyncPanel", () => {
  beforeEach(() => {
    vi.spyOn(serverClient, "listServerLayouts").mockResolvedValue([{ id: "1", name: "saved-a", updatedAt: "t1" }]);
  });

  it("renders the server layout list on construction", async () => {
    const container = document.createElement("div");
    new ServerSyncPanel(container, { getLayout: () => ({ gears: [], remoteLinks: [] }), applyLoadedLayout: () => {} });
    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toContain("saved-a");
  });

  it("applies the fetched gears when a saved layout's load button is clicked", async () => {
    vi.spyOn(serverClient, "fetchServerLayout").mockResolvedValue({
      id: "1", name: "saved-a", updatedAt: "t1", gears: [{ id: "g" } as unknown as import("../../src/sim/types").GearInstance], remoteLinks: [],
    });
    const applyLoadedLayout = vi.fn();
    const container = document.createElement("div");
    new ServerSyncPanel(container, { getLayout: () => ({ gears: [], remoteLinks: [] }), applyLoadedLayout });
    await Promise.resolve();
    await Promise.resolve();
    (container.querySelector("li button") as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(applyLoadedLayout).toHaveBeenCalledWith({ id: "1", name: "saved-a", updatedAt: "t1", gears: [{ id: "g" }], remoteLinks: [] });
  });

  describe("delete button", () => {
    it("does not call deleteServerLayout when the confirm guard is declined", async () => {
      const deleteSpy = vi.spyOn(serverClient, "deleteServerLayout").mockResolvedValue(undefined);
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const container = document.createElement("div");
      new ServerSyncPanel(container, { getLayout: () => ({ gears: [], remoteLinks: [] }), applyLoadedLayout: () => {} });
      await Promise.resolve();
      await Promise.resolve();
      const buttons = container.querySelectorAll("li button");
      (buttons[1] as HTMLElement).click(); // [0] = 불러오기, [1] = 삭제
      await Promise.resolve();
      await Promise.resolve();
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("saved-a"));
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("calls deleteServerLayout with the row's id and refreshes the list when confirmed", async () => {
      const deleteSpy = vi.spyOn(serverClient, "deleteServerLayout").mockResolvedValue(undefined);
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const listSpy = vi.spyOn(serverClient, "listServerLayouts").mockResolvedValue([{ id: "1", name: "saved-a", updatedAt: "t1" }]);
      const container = document.createElement("div");
      new ServerSyncPanel(container, { getLayout: () => ({ gears: [], remoteLinks: [] }), applyLoadedLayout: () => {} });
      await Promise.resolve();
      await Promise.resolve();
      listSpy.mockResolvedValue([]); // simulate the row being gone after deletion
      const buttons = container.querySelectorAll("li button");
      (buttons[1] as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(deleteSpy).toHaveBeenCalledWith("1");
      expect(listSpy.mock.calls.length).toBeGreaterThan(1); // refreshed again after deletion
      expect(container.textContent).not.toContain("saved-a");
    });

    it("clears currentId when the currently-loaded layout is deleted, so overwrite() no-ops afterward", async () => {
      vi.spyOn(serverClient, "fetchServerLayout").mockResolvedValue({
        id: "1", name: "saved-a", updatedAt: "t1", gears: [], remoteLinks: [],
      });
      vi.spyOn(serverClient, "deleteServerLayout").mockResolvedValue(undefined);
      const updateSpy = vi.spyOn(serverClient, "updateServerLayout").mockResolvedValue({ id: "1", name: "saved-a", updatedAt: "t2" });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const container = document.createElement("div");
      new ServerSyncPanel(container, { getLayout: () => ({ gears: [], remoteLinks: [] }), applyLoadedLayout: () => {} });
      await Promise.resolve();
      await Promise.resolve();

      // Load layout "1" so it becomes currentId.
      (container.querySelector("li button") as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();

      // Now delete that same layout via its row's delete button.
      const buttons = container.querySelectorAll("li button");
      (buttons[1] as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // A subsequent overwrite click should now no-op (currentId cleared) rather than
      // PUT-ing to a layout id that the server has already discarded.
      const overwriteBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "덮어쓰기") as HTMLElement;
      overwriteBtn.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
