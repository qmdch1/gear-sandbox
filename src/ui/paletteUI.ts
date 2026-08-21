import type { GearType } from "../sim/types";
import { PART_INFO } from "./partInfo";
import { loadOpenState, saveOpenState } from "./persistedOpenState";

interface Category {
  /** Stable key for persisting this category's open/closed state -- independent
   *  of `label`, so a future wording change to the label doesn't silently reset
   *  everyone's remembered state. */
  id: string;
  label: string;
  icon: string;
  types: GearType[];
}

const PALETTE_OPEN_STATE_KEY = "gear-sandbox:palette-open-categories";

// 10 parts is too many to scan as one flat grid — grouped by "what kind of part is
// this" (기어/동력원/부착 장치) so picking one is a two-tap drill-down instead of a wall
// of buttons.
const CATEGORIES: Category[] = [
  {
    id: "gears",
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
    id: "power",
    label: "동력원",
    types: ["crank"],
    icon: `<polygon points="55,8 24,56 44,56 40,92 76,44 53,44" fill="currentColor"/>`,
  },
  {
    id: "attachments",
    label: "부착 장치",
    types: ["load", "gauge", "fan", "wheel"],
    icon: `<polygon points="50,12 76,28 76,62 50,78 24,62 24,28" fill="none" stroke="currentColor" stroke-width="6"/>
      <circle cx="50" cy="45" r="13" fill="none" stroke="currentColor" stroke-width="5"/>`,
  },
  {
    id: "transmission",
    label: "동력 전달",
    types: ["shaft", "belt"],
    icon: `<circle cx="26" cy="26" r="12" fill="none" stroke="currentColor" stroke-width="6"/>
      <circle cx="74" cy="74" r="12" fill="none" stroke="currentColor" stroke-width="6"/>
      <line x1="34" y1="34" x2="66" y2="66" stroke="currentColor" stroke-width="8"/>`,
  },
  {
    // Deliberately a separate category from "동력 전달" -- a beam carries no
    // rotation at all (see meshing.ts's "structural" edge kind), it's a purely
    // rigid frame member, not a drivetrain part.
    id: "structure",
    label: "구조",
    types: ["beam"],
    icon: `<rect x="15" y="42" width="70" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="6"/>
      <line x1="15" y1="42" x2="15" y2="58" stroke="currentColor" stroke-width="4"/>
      <line x1="85" y1="42" x2="85" y2="58" stroke="currentColor" stroke-width="4"/>`,
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

    // Default to every category open (nothing to hunt for on a first visit);
    // once the user has actually toggled anything, remember exactly which
    // categories were open/closed and restore that same layout next time,
    // instead of always resetting to all-open.
    const savedOpenState = loadOpenState(PALETTE_OPEN_STATE_KEY);
    const openState: Record<string, boolean> = {};

    for (const category of CATEGORIES) {
      const categoryButton = document.createElement("button");
      categoryButton.className = "palette-category";
      categoryButton.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${category.icon}</svg>`;
      const categoryLabel = document.createElement("span");
      categoryLabel.textContent = category.label;
      categoryButton.appendChild(categoryLabel);

      const itemGrid = document.createElement("div");
      itemGrid.className = "palette-items";
      const isOpen = savedOpenState?.[category.id] ?? true;
      itemGrid.hidden = !isOpen;
      categoryButton.classList.toggle("open", isOpen);
      openState[category.id] = isOpen;
      for (const type of category.types) itemGrid.appendChild(buildPartButton(type, onPick));

      // Each category toggles independently -- several can stay open side by
      // side at once (e.g. "기어" and "동력원" both open while placing a gear
      // train), instead of opening one always closing every other one.
      categoryButton.addEventListener("click", () => {
        itemGrid.hidden = !itemGrid.hidden;
        const nowOpen = !itemGrid.hidden;
        categoryButton.classList.toggle("open", nowOpen);
        openState[category.id] = nowOpen;
        saveOpenState(PALETTE_OPEN_STATE_KEY, openState);
      });

      container.append(categoryButton, itemGrid);
    }
  }
}
