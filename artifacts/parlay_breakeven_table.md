# Parlay Breakeven Table (Binomial-Derived)

Per-leg breakeven p* where EV(p*)=0. All values from solver; payout schedules from parlay_structures.ts.

| Platform | StructureId | Size n | Type | Payout schedule (hits→mult) | Breakeven p* (%) | Breakeven American odds |
|----------|-------------|--------|------|-----------------------------|------------------|--------------------------|
| PP | 2P | 2 | Power | 2:3 | 57.74% | -137 |
| PP | 3P | 3 | Power | 3:6 | 55.03% | -122 |
| PP | 4P | 4 | Power | 4:10 | 56.23% | -128 |
| PP | 5P | 5 | Power | 5:20 | 54.93% | -122 |
| PP | 6P | 6 | Power | 6:37.5 | 54.66% | -121 |
| PP | 3F | 3 | Flex-1loss | 3:3, 2:1 | 57.74% | -137 |
| PP | 4F | 4 | Flex-1loss | 4:6, 3:1.5 | 55.03% | -122 |
| PP | 5F | 5 | Flex-1loss | 5:10, 4:2, 3:0.4 | 54.25% | -119 |
| PP | 6F | 6 | Flex-2loss | 6:25, 5:2, 4:0.4 | 54.21% | -118 |
| UD | UD_2P_STD | 2 | Standard | 2:3.5 | 53.45% | -115 |
| UD | UD_3P_STD | 3 | Standard | 3:6.5 | 53.58% | -115 |
| UD | UD_4P_STD | 4 | Standard | 4:10 | 56.23% | -128 |
| UD | UD_5P_STD | 5 | Standard | 5:20 | 54.93% | -122 |
| UD | UD_6P_STD | 6 | Standard | 6:35 | 55.29% | -124 |
| UD | UD_7P_STD | 7 | Standard | 7:65 | 55.08% | -123 |
| UD | UD_8P_STD | 8 | Standard | 8:120 | 54.97% | -122 |
| UD | UD_3F_FLX | 3 | Flex-1loss | 3:3.25, 2:1.09 | 55.39% | -124 |
| UD | UD_4F_FLX | 4 | Flex-1loss | 4:6, 3:1.5 | 55.03% | -122 |
| UD | UD_5F_FLX | 5 | Flex-1loss | 5:10, 4:2.5 | 54.75% | -121 |
| UD | UD_6F_FLX | 6 | Flex-2loss | 6:25, 5:2.6 | 54.54% | -120 |
| UD | UD_7F_FLX | 7 | Flex-2loss | 7:40, 6:2.75 | 56.43% | -130 |
| UD | UD_8F_FLX | 8 | Flex-2loss | 8:80, 7:3, 6:1 | 55.07% | -123 |

## Validation
- UD 2-pick Standard (3.5×): BE ≈ 53.45%, American ≈ -115.
- PP 6-pick Flex (25×/2×/0.4×): BE ≈ 54.21%, American ≈ -118.6.