// Chart series colours. Kept separate from the UI tokens: these are tuned for
// separation between series under colour-blind simulation, not for contrast
// against the background.

export const SERIES = {
  light: ["#1560D6", "#EB6834"],
  dark: ["#4C8DFF", "#D95926"],
} as const;

export const FUNNEL_RAMP = {
  light: ["#86B6EF", "#3987E5", "#1C5CAB"],
  dark: ["#184F95", "#2A78D6", "#86B6EF"],
} as const;

export const STATUS_COLOR = {
  good: "#0CA30C",
  warning: "#FAB219",
  serious: "#EC835A",
  critical: "#D03B3B",
} as const;

export type StatusKey = keyof typeof STATUS_COLOR;
