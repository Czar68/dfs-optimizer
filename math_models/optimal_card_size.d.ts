/**
 * math_models/optimal_card_size.ts
 * Anti-dilution: choose leg count that maximizes Card EV.
 * If adding the Nth leg would drop total CardEV below 3-leg or 4-leg EV,
 * the system forces the lower leg count. All math via registry + card_ev_from_registry.
 */
export type Platform = "PP" | "UD";
export type StructureKind = "Power" | "Flex";
export interface OptimalCardSizeResult {
    legCount: number;
    structureId: string;
    cardEv: number;
}
/**
 * Among 2..6 leg structures for this platform and kind, returns the leg count
 * and structure that maximize Card EV for the given leg probabilities.
 * Used for anti-dilution: if we built a 6-leg card but 4-leg EV is higher, use 4.
 */
export declare function getOptimalCardSize(probs: number[], platform: Platform, kind: StructureKind): OptimalCardSizeResult | null;
