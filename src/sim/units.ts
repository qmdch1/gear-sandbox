/** The bridge between this sandbox's world units and real SI units.
 *
 *  Every length in a layout -- a gear's `position`, a pitch radius, the ground grid -- is in
 *  world units, and until now that unit meant nothing physical: the numbers were only ever
 *  compared with each other (does this pitch circle reach that one?). The moment real mechanics
 *  enters -- gravity in m/s^2, a mass in kg, a torque in N*m -- the scale has to be pinned down,
 *  because 9.81 m/s^2 is a completely different fall depending on whether a world unit is a
 *  millimetre or a metre.
 *
 *  One world unit is ONE CENTIMETRE. That is the scale the existing presets were already drawn
 *  at without anyone saying so: a car wheel here has pitch radius 8 (-> 8 cm, a large toy car's
 *  wheel), the car body is about 20 x 26 units (-> 20 x 26 cm), and the 800-unit ground grid is
 *  an 8-metre yard. Reading the showroom as a workshop floor covered in desk-sized working
 *  models is exactly what it looks like, so this scale was chosen to match the drawings rather
 *  than the drawings being rescaled to match a round number.
 *
 *  Converting at the boundary (here) instead of sprinkling factors through the physics keeps
 *  every formula in `gravity.ts` and `dynamics.ts` in plain SI, where it can be checked against
 *  a textbook. */

/** How many world units make one metre. */
export const UNITS_PER_METRE = 100;

/** Standard gravity at the Earth's surface, m/s^2 -- the CGPM's defined standard value. */
export const EARTH_GRAVITY = 9.80665;

/** Gravity on a few other bodies, m/s^2, for the "what if this machine ran on the Moon"
 *  setting. Real measured surface values, not scaled guesses. */
export const GRAVITY_PRESETS = {
  earth: EARTH_GRAVITY,
  moon: 1.625,
  mars: 3.7207,
  jupiter: 24.79,
  zero: 0,
} as const;

export type GravityPreset = keyof typeof GRAVITY_PRESETS;

/** Density of the steel the gears and falling parts are modelled as, kg/m^3. Ordinary
 *  structural/carbon steel is 7800-7900; 7850 is the usual engineering figure. It is what turns
 *  a gear's drawn size into a real mass, and therefore into a real moment of inertia. */
export const STEEL_DENSITY = 7850;

export function metresToUnits(metres: number): number {
  return metres * UNITS_PER_METRE;
}

export function unitsToMetres(units: number): number {
  return units / UNITS_PER_METRE;
}

/** Linear acceleration expressed in world units per second squared. Gravity of 9.81 m/s^2 is
 *  981 units/s^2 here, which is why a dropped part crosses a 100-unit gap in under half a
 *  second -- correct, and worth knowing before assuming an integrator has gone unstable. */
export function accelerationToUnits(metresPerSecondSquared: number): number {
  return metresToUnits(metresPerSecondSquared);
}
