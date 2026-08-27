import type { LayoutState } from "../sim/types";
import {
  listServerLayouts,
  saveNewServerLayout,
  updateServerLayout,
  fetchServerLayout,
  type LayoutSummary,
} from "../persistence/serverClient";

export interface ServerSyncApi {
  getLayout(): LayoutState;
  applyLoadedLayout(layout: LayoutState): void;
}

export class ServerSyncPanel {
  private nameInput: HTMLInputElement;
  private list: HTMLUListElement;
  private currentId: string | null = null;

  constructor(private container: HTMLElement, private api: ServerSyncApi) {
    this.nameInput = document.createElement("input");
    this.nameInput.placeholder = "레이아웃 이름";

    const saveNewBtn = document.createElement("button");
    saveNewBtn.textContent = "서버에 새로 저장";
    saveNewBtn.addEventListener("click", () => this.saveNew());

    const overwriteBtn = document.createElement("button");
    overwriteBtn.textContent = "덮어쓰기";
    overwriteBtn.addEventListener("click", () => this.overwrite());

    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "목록 새로고침";
    refreshBtn.addEventListener("click", () => this.refresh());

    this.list = document.createElement("ul");

    container.append(this.nameInput, saveNewBtn, overwriteBtn, refreshBtn, this.list);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.renderList(await listServerLayouts());
    } catch (err) {
      console.error("Failed to refresh server layout list", err);
    }
  }

  private renderList(layouts: LayoutSummary[]): void {
    this.list.innerHTML = "";
    for (const layout of layouts) {
      const li = document.createElement("li");
      li.textContent = `${layout.name} (${layout.updatedAt}) `;
      const loadBtn = document.createElement("button");
      loadBtn.textContent = "불러오기";
      loadBtn.addEventListener("click", () => this.load(layout.id));
      li.appendChild(loadBtn);
      this.list.appendChild(li);
    }
  }

  private async saveNew(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!name) return;
    try {
      const summary = await saveNewServerLayout(name, this.api.getLayout());
      this.currentId = summary.id;
      await this.refresh();
    } catch (err) {
      console.error("Failed to save new server layout", err);
    }
  }

  private async overwrite(): Promise<void> {
    if (!this.currentId) return;
    try {
      await updateServerLayout(this.currentId, this.nameInput.value.trim() || "이름 없음", this.api.getLayout());
      await this.refresh();
    } catch (err) {
      console.error("Failed to overwrite server layout", err);
    }
  }

  private async load(id: string): Promise<void> {
    try {
      const detail = await fetchServerLayout(id);
      this.currentId = detail.id;
      this.nameInput.value = detail.name;
      this.api.applyLoadedLayout(detail); // LayoutDetail structurally contains {gears, remoteLinks}
    } catch (err) {
      console.error("Failed to load server layout", err);
    }
  }
}
