// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PartInfoModal } from "../../src/ui/partInfoModal";
import { PART_INFO } from "../../src/ui/partInfo";

describe("PartInfoModal", () => {
  beforeEach(() => {
    document.body.innerHTML = ""; // each test appends its own modal into document.body
  });

  it("populates the part's label, description, and purpose when shown", () => {
    const modal = new PartInfoModal(document.body);
    modal.show("worm", () => {});
    expect(document.body.textContent).toContain(PART_INFO.worm.label);
    expect(document.body.textContent).toContain(PART_INFO.worm.description);
    expect(document.body.textContent).toContain(PART_INFO.worm.purpose);
  });

  it("calls the confirm callback and hides when '배치하기' is clicked", () => {
    const modal = new PartInfoModal(document.body);
    const onConfirm = vi.fn();
    modal.show("spur", onConfirm);
    const confirmButton = document.querySelector<HTMLButtonElement>(".part-info-confirm")!;
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLDivElement>(".part-info-overlay")!.hidden).toBe(true);
  });

  it("does not call the confirm callback when cancelled", () => {
    const modal = new PartInfoModal(document.body);
    const onConfirm = vi.fn();
    modal.show("spur", onConfirm);
    const [, cancelButton] = document.querySelectorAll<HTMLButtonElement>(".part-info-buttons button");
    cancelButton.click();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLDivElement>(".part-info-overlay")!.hidden).toBe(true);
  });
});
