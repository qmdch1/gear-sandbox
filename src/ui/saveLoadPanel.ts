export interface SaveLoadApi {
  save(): void;
  load(): void;
  exportFile(): void;
  importFile(file: File): Promise<void>;
}

export class SaveLoadPanel {
  constructor(container: HTMLElement, api: SaveLoadApi) {
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "저장";
    saveBtn.addEventListener("click", () => api.save());

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "불러오기";
    loadBtn.addEventListener("click", () => api.load());

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "내보내기";
    exportBtn.addEventListener("click", () => api.exportFile());

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json";
    importInput.addEventListener("change", () => {
      const file = importInput.files?.[0];
      if (file) void api.importFile(file);
    });

    container.append(saveBtn, loadBtn, exportBtn, importInput);
  }
}
