/**
 * Polycast design tokens.
 *
 * Source of truth for the brand system approved during design review.
 * If the brand changes, change it HERE — apps/web's Tailwind config
 * and any other consumer should read from this file, not hardcode hex values.
 */

export const colors = {
  bg: "#F7F7FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F1F9",
  border: "#E8E9F3",
  text: "#14162B",
  muted: "#6E7191",
  mutedDim: "#A0A3C4",
  primary: "#6C5CE7",
  primaryDim: "#E4DFFB",
  positive: "#00C48C",
  positiveDim: "#D6F7EC",
  negative: "#FF5C77",
  negativeDim: "#FFE3E8",
  warm: "#FFB020",
  warmDim: "#FFF1D6",
} as const;

export const fonts = {
  display: "'Space Grotesk', sans-serif",
  body: "'Inter', sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

export const googleFontsUrl =
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

export type ColorToken = keyof typeof colors;
export type FontToken = keyof typeof fonts;
