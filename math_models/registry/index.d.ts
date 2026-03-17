/**
 * math_models/registry/index.ts
 * Load payout registry JSON files. Read-only; do not modify formulas.
 */
export interface RegistryEntry {
    platform: string;
    structureId: string;
    size: number;
    type: string;
    outcomes: Record<string, number>;
}
export declare function getRegistryEntry(structureId: string): RegistryEntry | null;
/** Payout multiplier by number of hits (0..n). From registry outcomes. */
export declare function getPayoutByHitsFromRegistry(structureId: string): Record<number, number> | null;
export declare function getAllRegistryStructureIds(): string[];
