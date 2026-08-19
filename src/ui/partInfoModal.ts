import type { GearType } from "../sim/types";
import { PART_INFO } from "./partInfo";

/** Shown every time a part is added from the palette — a picture + plain-language
 *  "how it connects" and "where/why it's actually used" before it gets placed, since
 *  this app is meant for teaching, not just building. */
export class PartInfoModal {
  private overlay: HTMLDivElement;
  private titleEl: HTMLHeadingElement;
  private iconEl: HTMLDivElement;
  private photoEl: HTMLImageElement;
  private descriptionEl: HTMLParagraphElement;
  private purposeEl: HTMLParagraphElement;
  private confirmBtn: HTMLButtonElement;
  private onConfirm: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.overlay = document.createElement("div");
    this.overlay.className = "part-info-overlay";
    this.overlay.hidden = true;

    const box = document.createElement("div");
    box.className = "part-info-box";

    // Everything except the action buttons scrolls internally if it's taller than the
    // viewport (a long description + photo shouldn't be able to push "배치하기"/"취소"
    // off-screen with no way to reach them) -- the buttons stay a fixed footer below.
    const content = document.createElement("div");
    content.className = "part-info-content";

    this.titleEl = document.createElement("h3");
    this.iconEl = document.createElement("div");
    this.iconEl.className = "part-info-icon";
    this.photoEl = document.createElement("img");
    this.photoEl.className = "part-info-photo";
    this.photoEl.alt = "";
    this.photoEl.hidden = true;
    this.descriptionEl = document.createElement("p");

    const purposeHeading = document.createElement("strong");
    purposeHeading.textContent = "어디에, 왜 쓰나요?";
    this.purposeEl = document.createElement("p");
    this.purposeEl.className = "part-info-purpose";

    content.append(this.titleEl, this.iconEl, this.photoEl, this.descriptionEl, purposeHeading, this.purposeEl);

    const buttons = document.createElement("div");
    buttons.className = "part-info-buttons";
    this.confirmBtn = document.createElement("button");
    this.confirmBtn.className = "part-info-confirm";
    this.confirmBtn.textContent = "배치하기";
    this.confirmBtn.addEventListener("click", () => {
      const callback = this.onConfirm;
      this.hide();
      callback?.();
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "취소";
    cancelBtn.addEventListener("click", () => this.hide());
    buttons.append(this.confirmBtn, cancelBtn);

    box.append(content, buttons);
    this.overlay.appendChild(box);
    root.appendChild(this.overlay);

    this.overlay.addEventListener("click", (event) => {
      if (event.target === this.overlay) this.hide();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.overlay.hidden) this.hide();
    });
  }

  show(type: GearType, onConfirm: () => void): void {
    const info = PART_INFO[type];
    this.titleEl.textContent = info.label;
    this.iconEl.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${info.icon}</svg>`;
    this.photoEl.hidden = !info.image;
    this.photoEl.src = info.image ?? "";
    this.descriptionEl.textContent = info.description;
    this.purposeEl.textContent = info.purpose;
    this.onConfirm = onConfirm;
    this.overlay.hidden = false;
  }

  hide(): void {
    this.overlay.hidden = true;
    this.onConfirm = null;
  }
}
