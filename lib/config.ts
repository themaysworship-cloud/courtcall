// The group's standing court time, shown on every day.
export const COURT_TIME_LABEL = "5–7am";

// Players per court.
export const COURT_SIZE = 4;

// RYVL games: same 5–7am time, at Springs East. Courts of 4; a full waitlist of 4 opens another court.
export const RYVL_PLACE = "Springs East Pickleball";
export const RYVL_LEVELS = [
  { level: "3.0-3.5", label: "3.0 – 3.5", fits: ["3.0", "3.5"] },
  { level: "3.5-4.0", label: "3.5 – 4.0", fits: ["3.5", "4.0"] },
] as const;
