# Underdog Fantasy Pick'em Structures Summary

## DISCOVERED STRUCTURES

Based on codebase analysis and current Underdog offerings:

### STANDARD (Power) Structures
- **UD_2P_STD**: 2-leg standard (5x payout)
- **UD_3P_STD**: 3-leg standard (5x payout) 
- **UD_4P_STD**: 4-leg standard (9x payout)
- **UD_5P_STD**: 5-leg standard (19x payout)
- **UD_6P_STD**: 6-leg standard (30x payout)

### INSURED Structures
- **UD_4P_INS**: 4-leg insured (6x max, 1x insurance for 3/4)
- **UD_5P_INS**: 5-leg insured (10x max, 1x insurance for 4/5)
- **UD_6P_INS**: 6-leg insured (15x max, 1x insurance for 5/6)
- **UD_7P_INS**: 7-leg insured (25x max, 1x insurance for 6/7)
- **UD_8P_INS**: 8-leg insured (40x max, 1x insurance for 7/8)

### FLEX Structures
- **UD_3F_STD**: 3-leg flex (3x on 3/3, 1x on 2/3)
- **UD_4F_STD**: 4-leg flex (6x on 4/4, 1.5x on 3/4)
- **UD_5F_STD**: 5-leg flex (10x on 5/5, 2.5x on 4/5)

### SHIFTED Structures
- Currently not implemented in codebase
- Placeholders available for future implementation

## CURRENT CODEBASE STATUS

### Currently Implemented:
- Standard: 3P, 4P, 5P, 6P (via underdog_card_ev.ts)
- Flex: 3F, 4F, 5F (via underdog_card_ev.ts)
- Missing: 2P standard, all insured structures, shifted structures

### Current Limitations:
- No 2-leg standard support
- No insured structure support (4P-8P)
- No shifted structure support
- Hard-coded payouts in underdog_card_ev.ts
- No unified structure configuration

## NEXT STEPS

1. Update underdog_card_ev.ts to use new structure configuration
2. Add support for 2P standard
3. Implement insured structure logic
4. Add shifted structure support when needed
5. Implement proper break-even calculations for Underdog math

## IMPORTANT NOTES

- Underdog break-even math differs from PrizePicks
- Do not reuse PrizePicks thresholds or EV formulas
- Insured structures require special hit distribution logic
- Shifted structures may have market-specific payouts
