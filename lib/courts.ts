import { COURT_SIZE } from "./config";

/** First come, first served: the first players in line fill full courts. */
export function onFullCourt(idsInOrder: string[]): string[] {
  return idsInOrder.slice(0, Math.floor(idsInOrder.length / COURT_SIZE) * COURT_SIZE);
}
