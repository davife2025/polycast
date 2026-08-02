import type { Config } from "tailwindcss";
import { colors, fonts } from "@polycast/ui/tokens";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: colors.bg,
        surface: colors.surface,
        "surface-alt": colors.surfaceAlt,
        border: colors.border,
        text: colors.text,
        muted: colors.muted,
        "muted-dim": colors.mutedDim,
        primary: colors.primary,
        "primary-dim": colors.primaryDim,
        positive: colors.positive,
        "positive-dim": colors.positiveDim,
        negative: colors.negative,
        "negative-dim": colors.negativeDim,
        warm: colors.warm,
        "warm-dim": colors.warmDim,
      },
      fontFamily: {
        display: fonts.display.split(",").map((f) => f.trim()),
        body: fonts.body.split(",").map((f) => f.trim()),
        mono: fonts.mono.split(",").map((f) => f.trim()),
      },
    },
  },
  plugins: [],
};

export default config;
