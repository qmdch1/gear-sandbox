import type { GearType } from "../sim/types";
import { PART_INFO } from "./partInfo";

interface Category {
  label: string;
  icon: string;
  types: GearType[];
}

// 10 parts is too many to scan as one flat grid — grouped by "what kind of part is
// this" (기어/동력원/부착 장치) so picking one is a two-tap drill-down instead of a wall
// of buttons.
const CATEGORIES: Category[] = [
  {
    label: "기어",
    types: ["spur", "helical", "bevel", "worm"],
    icon: `<circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-width="7"/>
      <circle cx="50" cy="50" r="9" fill="none" stroke="currentColor" stroke-width="4"/>
      <g stroke="currentColor" stroke-width="7">
        <line x1="50" y1="10" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="90"/>
        <line x1="10" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="90" y2="50"/>
      </g>`,
  },
  {
    label: "동력원",
    types: ["crank", "battery", "outlet"],
    icon: `<polygon points="55,8 24,56 44,56 40,92 76,44 53,44" fill="currentColor"/>`,
  },
  {
    label: "부착 장치",
    types: ["load", "gauge", "fan"],
    icon: `<polygon points="50,12 76,28 76,62 50,78 24,62 24,28" fill="none" stroke="currentColor" stroke-width="6"/>
      <circle cx="50" cy="45" r="13" fill="none" stroke="currentColor" stroke-width="5"/>`,
  },
];

function buildPartButton(type: GearType, onPick: (type: GearType) => void): HTMLButtonElement {
  const info = PART_INFO[type];
  const button = document.createElement("button");
  button.className = "palette-item";
  button.title = info.description; // quick hover reminder; the full picture is one click away
  button.dataset.gearType = type;
  button.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${info.icon}</svg>`;
  const label = document.createElement("span");
  label.textContent = info.label;
  button.appendChild(label);
  button.addEventListener("click", () => onPick(type));
  return button;
}

export class PaletteUI {
  constructor(container: HTMLElement, onPick: (type: GearType) => void) {
    container.classList.add("palette");
    const allItemGrids: HTMLElement[] = [];
    const allCategoryButtons: HTMLElement[] = [];

    for (const category of CATEGORIES) {
      const categoryButton = document.createElement("button");
      categoryButton.className = "palette-category";
      categoryButton.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${category.icon}</svg>`;
      const categoryLabel = document.createElement("span");
      categoryLabel.textContent = category.label;
      categoryButton.appendChild(categoryLabel);

      const itemGrid = document.createElement("div");
      itemGrid.className = "palette-items";
      itemGrid.hidden = true;
      for (const type of category.types) itemGrid.appendChild(buildPartButton(type, onPick));

      categoryButton.addEventListener("click", () => {
        const reopening = itemGrid.hidden;
        for (const grid of allItemGrids) grid.hidden = true;
        for (const btn of allCategoryButtons) btn.classList.remove("open");
        if (reopening) {
          itemGrid.hidden = false;
          categoryButton.classList.add("open");
        }
      });

      allItemGrids.push(itemGrid);
      allCategoryButtons.push(categoryButton);
      container.append(categoryButton, itemGrid);
    }
  }
}
