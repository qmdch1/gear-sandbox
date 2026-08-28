// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { SaveLoadPanel, type SaveLoadApi } from "../../src/ui/saveLoadPanel";

function makeApi(overrides: Partial<SaveLoadApi> = {}): SaveLoadApi {
  return {
    save: vi.fn(),
    load: vi.fn(),
    exportFile: vi.fn(),
    importFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fireFileChange(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change"));
}

describe("SaveLoadPanel", () => {
  it("renders exactly the four expected controls", () => {
    const container = document.createElement("div");
    new SaveLoadPanel(container, makeApi());

    const buttons = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual(["저장", "불러오기", "내보내기"]);

    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(1);

    expect(container.children.length).toBe(4);
  });

  it("clicking the save button invokes only api.save()", () => {
    const container = document.createElement("div");
    const api = makeApi();
    new SaveLoadPanel(container, api);
    const [saveBtn] = Array.from(container.querySelectorAll("button"));
    (saveBtn as HTMLElement).click();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.load).not.toHaveBeenCalled();
    expect(api.exportFile).not.toHaveBeenCalled();
  });

  it("clicking the load button invokes only api.load()", () => {
    const container = document.createElement("div");
    const api = makeApi();
    new SaveLoadPanel(container, api);
    const [, loadBtn] = Array.from(container.querySelectorAll("button"));
    (loadBtn as HTMLElement).click();
    expect(api.load).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
    expect(api.exportFile).not.toHaveBeenCalled();
  });

  it("clicking the export button invokes only api.exportFile()", () => {
    const container = document.createElement("div");
    const api = makeApi();
    new SaveLoadPanel(container, api);
    const [, , exportBtn] = Array.from(container.querySelectorAll("button"));
    (exportBtn as HTMLElement).click();
    expect(api.exportFile).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
    expect(api.load).not.toHaveBeenCalled();
  });

  it("the file input accepts application/json", () => {
    const container = document.createElement("div");
    new SaveLoadPanel(container, makeApi());
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    expect(input.accept).toBe("application/json");
  });

  it("selecting a file invokes api.importFile with that exact file", () => {
    const container = document.createElement("div");
    const api = makeApi();
    new SaveLoadPanel(container, api);
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["{}"], "gear-scene.json", { type: "application/json" });

    fireFileChange(input, [file]);

    expect(api.importFile).toHaveBeenCalledTimes(1);
    expect(api.importFile).toHaveBeenCalledWith(file);
  });

  it("does not call importFile when the file input's change fires with no files selected", () => {
    const container = document.createElement("div");
    const api = makeApi();
    new SaveLoadPanel(container, api);
    const input = container.querySelector("input[type=file]") as HTMLInputElement;

    fireFileChange(input, []);

    expect(api.importFile).not.toHaveBeenCalled();
  });
});
