// The look plan, in one place. Ember Yard is a freight yard at dusk: warm sand and rust
// under a violet sky, one amber sun, cool blue shadows. Six values and one accent hue; the
// lighting makes every shade the game needs, so no other colour appears in the code. The same
// six names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#191411',
  surface: '#2b2118',
  hairline: '#4a3a28',
  ink: '#f2e8d5',
  muted: '#a89a80',
  accent: '#ff9a2e',
};

export function shade(name) {
  return PALETTE[name];
}
