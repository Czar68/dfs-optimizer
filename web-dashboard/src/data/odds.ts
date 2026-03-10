/** UD parlays: only show cards with expected value >= break-even (odds >= 1.0) */
export const filterUD = (odds: number) => odds >= 1.0;
