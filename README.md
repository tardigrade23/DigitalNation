# Digital Nation

A mobile-first **idle nation simulator** prototype. You start as a small digital state with one million citizens and grow it into the world's most advanced digital nation.

## Run it

You don't need to install anything. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The game saves itself to the browser's `localStorage` every 5 seconds.

To make a single self-contained HTML file, for example to publish or share as one page:

```bash
python3 tools/build_single_file.py dist/digital-nation.html
```

## Screens

The bottom tab bar has five screens:

| Screen | What's on it |
|---|---|
| **Nation** | Capital skyline that grows as you build, **Collect Taxes** tap button, population, welfare, influence, defense, next goal, and the 2× income boost |
| **Sectors** | 10 sectors, from Internet Provider to Satellite Internet. Buy ×1 / ×10 / ×100 / Max. Income doubles at 25, 50, 100, 200… owned |
| **Upgrades** | Sector boosts, AI upgrades that multiply all income, and tax (tap power) upgrades |
| **Security** | Defense level, auto-defense chance, and attack history |
| **Global** | Technology export (prestige) and statistics |

## Core systems

- **GDP** is the main currency. You earn it from sectors every second and from taps.
- **Population and welfare** grow with your facilities and multiply all income. Smart City has the biggest effect on welfare.
- **Tech ranking** moves from #195 to #1 based on the GDP you have earned in total.
- **Cyber attacks** happen every 1.5–2.5 minutes. You have 12 seconds to tap **Defend** for a reward. If you miss it, your defense level decides the outcome. A breach steals 10% of your GDP and halves income for 30 seconds.
- **Technology export** resets the run in exchange for Influence. Each point adds a permanent +10% to all income.
- **Offline income**: while you're away, you earn 50% of your normal income for up to 8 hours.
- **2× boost**: a stand-in for a rewarded ad.

## Files

- `index.html`: app shell, the SVG icon sprite, and the screens
- `style.css`: visual design, built phone-first and safe-area aware
- `game.js`: game logic, rendering, and the canvas skyline. The balance constants are at the top (`SECTORS`, `COST_GROWTH`, `PRESTIGE_DIVISOR` and others)
- `tools/build_single_file.py`: bundles the three files into one HTML page

## Next steps

- Tune the balance through playtests: the first 10 minutes and the time to the first export
- Daily rewards and VIP membership
- A gem shop with time skips, a permanent 2× multiplier, and cosmetic flags
- Sound effects and haptics
- Packaging as a PWA, or as a native app through Capacitor
