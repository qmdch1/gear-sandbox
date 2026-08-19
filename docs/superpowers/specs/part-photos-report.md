# Part reference photos — licensing report

All 10 part types got a verified real-world reference photo. Each was checked directly on its
source page (not just the search result) before downloading. Files live in `public/parts/<type>.jpg`
and are referenced from `src/ui/partInfo.ts` via `PartInfo.image`.

| # | Part (type) | Found? | Source URL | License (as stated on the source page) |
|---|---|---|---|---|
| 1 | spur gear (`spur`) | Yes | https://pixabay.com/photos/macro-cogwheel-gear-engine-vintage-1452987/ | "Free for use under the Pixabay Content License" |
| 2 | helical gear (`helical`) | Yes | https://commons.wikimedia.org/wiki/File:Double-helical_gear.jpg | "This file is made available under the Creative Commons CC0 1.0 Universal Public Domain Dedication." |
| 3 | crank (`crank`) | Yes | https://pixabay.com/photos/wheel-crank-mechanics-hand-wheel-783019/ | "Free for use under the Pixabay Content License" |
| 4 | bevel gear (`bevel`) | Yes | https://pixabay.com/photos/gear-crown-gear-splines-metal-2612035/ | "Free for use under the Pixabay Content License" |
| 5 | worm gear (`worm`) | Yes | https://pixabay.com/photos/small-mechanics-engine-worm-gear-717702/ | "Free for use under the Pixabay Content License" |
| 6 | load/flywheel (`load`) | Yes | https://pixabay.com/photos/lanz-bulldog-flywheel-historical-4546648/ | "Free for use under the Pixabay Content License" |
| 7 | gauge/tachometer (`gauge`) | Yes | https://pixabay.com/photos/tachometer-dash-rpm-car-automotive-923226/ | "Free for use under the Pixabay Content License" |
| 8 | fan/propeller (`fan`) | Yes | https://pixabay.com/photos/air-blade-blowing-chrome-cool-2260/ | "Free for use under the Pixabay Content License" |
| 9 | battery (`battery`) | Yes | https://pixabay.com/photos/battery-alkaline-batteries-charge-4912813/ | "Free for use under the Pixabay Content License" |
| 10 | outlet (`outlet`) | Yes | https://pixabay.com/photos/power-outlet-wall-electrics-243452/ | "Free for use under the Pixabay Content License" |

## Notes / methodology

- The Pixabay Content License is royalty-free and does not require attribution (see
  https://pixabay.com/service/license-summary/); the task brief explicitly lists Pixabay as an
  acceptable source ("their license is royalty-free/CC0-like, but verify on the image's own
  page"). Every Pixabay page above was fetched individually and the "Free for use under the
  Pixabay Content License" notice was confirmed on that specific photo's page (not just the
  search results page) before downloading.
- The helical gear photo is sourced from Wikimedia Commons and is explicitly CC0 (public domain
  dedication) — confirmed on the file's own page, not the category/search listing.
- Several other candidates were checked and rejected for licensing reasons before landing on the
  final picks, notably:
  - `File:Spur_gear.JPG` (Commons) — rejected: dual-licensed GFDL 1.2 / **CC BY-SA 3.0**
    (attribution-required, not allowed).
  - `File:Baker_Monitor_cast_iron_hand_well_pump...JPG` (Commons) — rejected: **CC BY 3.0**
    (attribution-required).
  - `File:Worm_gear.jpg`, `File:Gearbox_with_worm_and_gears.jpg` (Commons) — rejected: **CC
    BY-SA 4.0**.
  - `File:Bevel_gears_on_grain_mill_at_Dordrecht...jpg` (Commons) — rejected: **CC BY-SA 2.5**.
  - `File:ParPum_P1010134.JPG` (Commons, a well-pump photo) — license was actually fine (PD,
    dedicated by its author Bashereyre), but the photo didn't clearly show a crank handle, so it
    was set aside in favor of the Pixabay wheel-crank photo above, which shows the handle clearly.
- Several other Pixabay candidates were downloaded and visually inspected, then discarded for not
  clearly depicting the part even though the license was fine (e.g. an early "spur gear" search
  hit that was actually an automotive flywheel/clutch assembly close-up; a "fan" search hit that
  turned out to be an industrial cooling-tower propeller; a wall-outlet search hit that was
  actually a portable power strip, not a wall-mounted socket). The final picks were chosen only
  after opening the actual image and confirming it matches the part.
- Because none of the 10 parts turned out to need skipping, there is no "skipped" row in the
  table above — all 10 have `image` set in `src/ui/partInfo.ts`.
