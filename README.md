# Digital Nation

A mobile-first **idle nation simulator** prototype. You start as a small digital state with one million citizens and grow it into the world's most advanced digital nation.

## Run it

You don't need to install anything. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The game saves itself to the browser's `localStorage` every 5 seconds.

## Install as an app (PWA)

Digital Nation is a Progressive Web App. Once it is hosted over HTTPS, players can install it to their home screen. It then opens full screen with its own icon and works offline.

- **Android / Chrome:** Profile → App → **Install**, or use the browser menu → *Install app*
- **iPhone / Safari:** Share → *Add to Home Screen*

### Hosting on GitHub Pages

`.github/workflows/deploy-pages.yml` publishes the game every time the repository's default branch changes. You only need to set it up once:

1. Open the repository on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to the default branch, or run the workflow by hand from the **Actions** tab.

The game will be live at `https://<user>.github.io/<repo>/`. GitHub Pages is free for public repositories. Private repositories need a paid GitHub plan.

PWA files:
- `manifest.webmanifest`: app name, colors, and icons
- `sw.js`: service worker. It loads app files from the network first, so updates arrive quickly, and falls back to the cache when offline
- `icons/`: app icon (`icon.svg` is the source) and its rendered PNG sizes

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
| **Govern** | Era progress, plus three tabs: **Policies**, **Research** and **Export** (prestige) |
| **Profile** | Opened from the avatar or flag at the top. Leader and nation names, avatar, national flag, achievements, statistics, and app install |

## Core systems

- **GDP** is the main currency. You earn it from sectors every second and from taps.
- **Population and welfare** grow with your facilities and multiply all income. Smart City has the biggest effect on welfare.
- **Tech ranking** moves from #195 to #1 based on the GDP you have earned in total.
- **Cyber attacks** happen every 1.5–2.5 minutes. Tap **Defend** to open a mini-game: catch the malware 5 times on a 3×3 grid before the timer runs out (12 s, or more with research). Winning gives 30 seconds of income. If you miss it, your defense level decides the outcome. A breach steals 10% of your GDP and halves income for 30 seconds.
- **Technology export** resets the economy in exchange for Influence. Each point adds a permanent +10% to all income. Research and policies are kept.
- **Policies** unlock at 5 E-Government portals. There are four areas (Tax Rate, Internet, Education, Trade), each with three options. Every option has a benefit and a cost, and changing one starts a 1-minute cooldown.
- **Research** unlocks with the first Mobile Banking service. Facilities produce research points (RP), and Data Centers, AI Labs and Quantum Computers produce the most. The tree has 12 permanent projects in three branches: Economy, Society and Security.
- **Eras**: Connected → Information (4 research) → AI (8 research + an AI Lab) → Quantum (12 research + Quantum Computing). Each era multiplies all income: ×1.5, ×2.25, ×3.5.
- **Offline income**: while you're away, you earn 50% of your normal income for up to 8 hours.
- **2× boost**: a stand-in for a rewarded ad.
- **Tutorial**: four guided steps for new players (tap, open Sectors, build, passive income), then one-time tips for the first cyber attack, the first affordable upgrade, and the first technology export. It can be replayed from Profile → Settings.
- **Daily reward**: a 7-day streak. Rewards are minutes of current income with a minimum amount, and day 7 also gives 30 minutes of 2× income. Missing a day restarts the streak.
- **Sound and vibration**: synthesized with Web Audio, so there are no audio files. Vibration works on Android only. Both can be turned off in Profile → Settings.

## Files

- `index.html`: app shell, the SVG icon sprite, and the screens
- `style.css`: visual design, built phone-first and safe-area aware
- `game.js`: game logic, rendering, and the canvas skyline. The balance constants are at the top (`SECTORS`, `COST_GROWTH`, `PRESTIGE_DIVISOR` and others)
- `tools/build_single_file.py`: bundles the three files into one HTML page. PWA tags are left out

## Next steps

- Tune the balance through playtests: the first 10 minutes and the time to the first export
- VIP membership
- A gem shop with time skips, a permanent 2× multiplier, and cosmetic flags
- Native Android / iOS builds through Capacitor, for real rewarded ads and in-app purchases
