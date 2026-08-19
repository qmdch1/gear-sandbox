export interface SaveLoadApi {
  save(): void | Promise<void>;
  load(): void | Promise<void>;
}

/** Exactly two buttons -- no local-file export/import, no named/listable layouts.
 *  There's no user-account concept in this sandbox, so "save" always overwrites the
 *  one thing the server has, and "load" always reads back everything it has. */
export class SaveLoadPanel {
  constructor(container: HTMLElement, api: SaveLoadApi) {
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "저장";
    saveBtn.addEventListener("click", () => api.save());

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "불러오기";
    loadBtn.addEventListener("click", () => api.load());

    container.append(saveBtn, loadBtn);
  }
}
