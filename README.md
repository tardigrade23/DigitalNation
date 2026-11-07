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

- **Android / Chrome:** Profile → ⚙ Settings → App → **Install**, or use the browser menu → *Install app*
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
| **Sectors** | 24 sectors in 7 eras, from Internet Provider to Space Agency. A sector appears once your nation reaches its era. Buy ×1 / ×10 / ×100 / Max. Income doubles at 25, 50, 100, 200… owned |
| **Upgrades** | Sector boosts, AI upgrades that multiply all income, and tax (tap power) upgrades |
| **Security** | Defense level, auto-defense chance, and attack history |
| **Govern** | Era progress, plus three tabs: **Policies**, **Research** and **Export** (prestige) |
| **Profile** | Opened from the avatar or flag at the top. Leader and nation names, avatar, national flag, achievements and statistics. The ⚙ button opens **Settings** (sound, vibration, anonymous stats, tutorial replay, install, privacy and terms, reset, account deletion) |

## Core systems

- **GDP** is the main currency. You earn it from sectors every second and from taps.
- **Population and welfare** grow with your facilities and multiply all income. Smart City has the biggest effect on welfare.
- **World ranking (Tech Index)** moves from #195 to #1. It scores the whole nation: lifetime GDP, research, era, welfare, security and influence. Reaching #1 takes the final era and several technology exports. Tap the rank in the header to see the breakdown.
- **Cyber attacks** happen every 1.5–2.5 minutes. Tap **Defend** to open a mini-game: catch the malware 5 times on a 3×3 grid before the timer runs out (12 s, or more with research). Winning gives 30 seconds of income. If you miss it, your defense level decides the outcome. A breach steals 10% of your GDP and halves income for 30 seconds.
- **Technology export** resets the economy in exchange for Influence. Each export gives about 25 Influence per tenfold of GDP above $1B earned since the last export, and each point adds a permanent +5% to all income. Research and policies are kept.
- **Policies** unlock at 5 E-Government portals. There are four areas (Tax Rate, Internet, Education, Trade), each with three options. Every option has a benefit and a cost, and changing one starts a 1-minute cooldown.
- **Research** unlocks with the first Mobile Banking service. Facilities produce research points (RP). A project costs RP and then takes time: 10 minutes for the first project in a branch, then 1 h, 4 h, 16 h, 2 days, 4 days and 8 days. The lab runs one project at a time, also while the player is away. The tree has 42 permanent projects in six branches: Economy, Society, Security, Infrastructure, Science & AI, and Green Tech. Every project is named after a real technology, such as TCP/IP, Public Key Infrastructure, Transformers or Post-Quantum Cryptography.
- **Eras**: Connected → Information → Platform → Smart → AI → Quantum → Space. Each era needs a number of completed research projects plus one key sector from the era before. Each era unlocks new sectors and multiplies all income (×1.5 up to ×12).
- **Tech Encyclopedia**: 66 cards, one for every sector and research project. Each card explains the technology, gives a real-world example (such as Estonia's X-Road, India's UPI, Kenya's M-Pesa or Azerbaijan's ASAN Xidmət) and a "Did you know?" fact, and ends with a 3-answer quiz worth +3 gems. Cards unlock as you build and research. Open them from the Nation screen or with the ⓘ button on a sector or research row. The content is in `content.js`.
- **Encyclopedia pictures**: 65 of the 66 cards have a free-licensed photo (or, for abstract topics such as IPv6 or public key infrastructure, a diagram) from Wikimedia Commons. Author, license and a link to the source are shown under each picture. The images are 640 px WebP files in `images/library/` (about 3 MB in total), and the credits are in `images/library/credits.js`.
  - Images are fetched by the **Fetch encyclopedia images** workflow (`tools/fetch_library_images.py`), because the development sandbox cannot reach Wikimedia. Its modes: `lead` takes free lead images of Wikipedia articles; `review` saves Commons photo candidates to `images/library/_review/`; `apply` downloads the picks in `tools/library_image_picks.json` and converts everything to WebP.
  - Only free licenses are accepted; anything Commons marks as non-free is rejected.
- **Offline income**: while you're away, you earn 50% of your normal income for up to 8 hours.
- **2× boost**: a stand-in for a rewarded ad.
- **Tutorial**: four guided steps for new players (tap, open Sectors, build, passive income), then one-time tips for the first cyber attack, the first affordable upgrade, and the first technology export. It can be replayed from Profile → ⚙ Settings.
- **Daily reward**: a 7-day streak. Rewards are minutes of current income with a minimum amount, and day 7 also gives 30 minutes of 2× income. Missing a day restarts the streak.
- **Sound and vibration**: synthesized with Web Audio, so there are no audio files. Vibration works on Android only. Both can be turned off in Profile → ⚙ Settings.

## Accounts and cloud save

Players can play without an account. From **Profile → Save your progress** they sign in with their email: they get a one-time code (or a sign-in link in the same email), and no password is needed. After that, their nation, gems, purchases and settings are the same on every device.

- **Backend**: Supabase project *Digital Nation* (`dygrvzxnfsozjaxlbcoz`, eu-central-1). There is one row per player in `public.saves`, and row level security lets each player read and write only their own row. The schema is in `supabase/migrations/`.
- **First sign-in on a device**:
  - If the account has no save yet, this device's progress is uploaded.
  - If this device is new (almost no progress), the account's nation is loaded.
  - If both have real progress, the player chooses which one to keep.
- **Sync**: every 30 seconds while the game is open, when it goes to the background, and when it comes back. Each device remembers the server timestamp of the last save it wrote or loaded. If the server has a different timestamp, another device saved in the meantime, so that newer save is loaded instead of being overwritten.
- `vendor/supabase.js` is supabase-js 2.45.4, served locally so the game works offline and does not depend on a CDN.
- The single-file claude.ai build leaves accounts out, because that host blocks requests to Supabase.

- **Account deletion**: Profile → ⚙ Settings → *Delete my account* (type DELETE to confirm) calls `public.delete_my_account()`. This server function deletes the signed-in user and, by cascade, all of their rows. Progress stored on the device is kept, and *Reset progress on this device* removes it.
- **Legal pages**: `privacy.html` and `terms.html`, linked from Profile → ⚙ Settings → About. Before launch, replace the GitHub issues contact with a real support email.

**One-time Supabase dashboard settings** (Authentication section):
1. **URL Configuration**: set *Site URL* to `https://tardigrade23.github.io/DigitalNation/` and add it under *Redirect URLs*.
2. **Emails → Magic Link** template: add `{{ .Token }}` so the email shows the 6-digit code next to the link.
3. Before launch, set up custom SMTP (for example Resend). The built-in email service only sends a few emails per hour.

## Anonymous statistics (opt-in)

After the tutorial, players are asked once whether to share anonymous gameplay statistics. They can change this any time in Profile → Settings. Events are queued, sent in batches every 15 seconds and when the app goes to the background, and stored in `public.events`. They are linked to a random device ID, never to an email. The API only allows inserts, so nobody can read events through the app; read them in the Supabase SQL Editor.

Events: `session_start`, `tutorial_step`, `tutorial_done`, `tutorial_skip`, `sector_first`, `research_done`, `era_reached`, `export`, `quiz_answer`, `daily_claim`, `achievement`, `attack`, `policy_change`, `screen_open`, `purchase_sim`, `sign_in`, `stats_on`.

```sql
-- How long it takes to reach each era (median hours)
select props->>'era' as era, count(*) as players,
       percentile_cont(0.5) within group (order by (props->>'hours')::numeric) as median_hours
from events where name = 'era_reached' group by 1 order by 1;

-- Day-1 retention: players with a session on the day after their first one
with first as (select anon_id, min(created_at)::date as d0 from events group by 1)
select count(*) as players,
       count(*) filter (where exists (select 1 from events e where e.anon_id = f.anon_id
                        and e.created_at::date = f.d0 + 1)) as came_back_next_day
from first f;

-- Quiz questions people get wrong most often
select props->>'id' as card, count(*) as answers,
       round(100.0 * avg(case when (props->>'ok')::boolean then 1 else 0 end)) as pct_correct
from events where name = 'quiz_answer' group by 1 having count(*) >= 5 order by pct_correct;
```

`public.prune_events()` deletes statistics older than 12 months. Run it from the SQL Editor or a scheduled job.

## Missions

Every day the player gets 3 missions, and every week (starting Monday) 1 bigger mission. They are picked from templates that fit the player's stage: taps, building, earning, upgrades, research, quizzes, cyber defense, the minigame and policies. Targets scale with the nation; for example, "earn GDP" asks for 30 minutes of current income. Rewards: +5 gems and 15 minutes of income per daily mission, and +25 gems and 1 hour of income for the weekly one. For signed-in players the server checks them (`mission`: at most 3 a day; `weekly`: once a week; see `supabase/migrations/20261106090000_missions_rewards.sql`).

## National events

After the tutorial, a national event happens every 25–45 minutes of play, and soon after the player returns from a break of more than 2 hours. Each event is based on a real one, shown in a "Real world" box. Examples: the 2007 cyber attacks on Estonia, the 2020 school closures, the 2020–2023 chip shortage, WannaCry, the 2008 undersea cable cuts, GDPR, the 2022 Starlink solar storm loss, e-Residency, internet voting, deepfakes, heatwaves and the UPI payments boom. The player picks one of 2–3 responses. A response can cost or earn minutes of income, and can change income, defense, welfare, research or influence for a while; active effects show as chips in the header. Events are defined in `content.js` (`NATIONAL_EVENTS`). The game avoids repeats and prefers events the player has seen least.

## Player leaderboard

The **World Ranking** screen (tap the trophy rank in the header, or the rank chip in Profile) shows your Tech Index and ranks real players by Tech Index (top 50, plus your own position if you are lower). Signed-in players' entries (nation, leader, flag, score, era) are written to `public.leaderboard` when they sync, at most every 5 minutes. Anyone can read the table; each player can write only their own row. Scores are reported by the game client, so they can be faked by a determined cheater; before a public launch, move the score calculation to the server or add plausibility checks.

## Monetization (prototype)

Real-money purchases are **simulated** in the web build and clearly labeled, with a test-mode limit of 2 per day so the balance stays realistic. They will be connected to Google Play Billing and StoreKit (for example through RevenueCat) in the native build. Rewarded ads are a 3-second placeholder screen, to be replaced by AdMob.

- **Gems** (premium currency). New players start with 25.
  - Free sources: +10 per achievement, daily reward days 3/5/7 (+5/+10/+20), +25 per new era, +2 per cyber mini-game win, and +5 per rewarded ad (5 per day).
  - Saves from before gems existed get gems for the achievements they already earned.
- **Gem packs**: 100 ($0.99), 550 ($4.99), 1,200 ($9.99), 2,500 ($19.99).
- **Time Warp**: 1 h / 2 h / 4 h of income for 40 / 70 / 120 gems, at most 3 per day.
- **Boosts**:
  - Golden Economy: permanent ×2 income, kept after exports, 1,500 gems.
  - Cyber Shield: no attacks for 24 h, 150 gems.
  - Research Grant: 1 h of RP, at least 200 RP, 100 gems.
- **Cosmetics**: 4 premium flags and 3 premium avatar colors (100–250 gems). Buy them in the Shop, or tap a locked item in Profile.
- **VIP ($4.99 / month)**: no ads, full offline earnings for up to 24 h, +10 gems with every daily reward, and a gold avatar ring with a VIP badge.

### Server-side gems (signed-in players)

When a player is signed in, the server owns gems, VIP, Golden Economy, the Cyber Shield and premium cosmetics (`public.wallets`). Every change is written to `public.gem_ledger`.
- **Earning** goes through `wallet_earn`, which fixes the amounts and limits: achievements, quizzes and eras are paid once each; daily rewards, minigame wins and ads are capped per UTC day. Gems appear on screen right away; if the device is offline, they wait in `pendingEarns` and are sent later.
- **Spending** goes through `wallet_spend`, which uses the server's price list and the limit of 3 warps per day. If the balance shown on screen was edited by hand, the server refuses and the real balance is restored.
- **Simulated purchases** go through `purchase_simulated`, limited to 2 per day. Before launch, replace it with store receipt validation.
- On the first sign-in, the device's gems and items are imported once, with caps of 1,500 gems and VIP for at most 31 days.
- Guests keep everything on the device, as before.

## Balance simulation

`tools/simulate.mjs` plays the real game code with simulated time. The bot plays a few short sessions a day, buys whatever pays back fastest, keeps the lab busy, claims the daily reward and exports when it pays off.

```bash
python3 -m http.server 8765 &
node tools/simulate.mjs 75 4 15   # days, sessions per day, minutes per session
```

Results with the current balance (day the era is reached):

| Era | Active player (4 × 15 min a day) | Casual player (2 × 10 min a day) |
|---|---|---|
| Information | 0.6 | 2.3 |
| Platform | 1.8 | 5.3 |
| Smart | 3.5 | 8.3 |
| AI | 5.8 | 13.3 |
| Quantum | 12.3 | 21.3 |
| Space | 24.6 | 35.3 |

The active bot reaches #4 in the world ranking after 60 days. Before this pass, it reached the last era in its first 15 minutes and #1 on day 2. The main changes:
- research takes real time;
- sector costs rise ×8 per tier while income rises ×5.5;
- AI upgrades and sector upgrades are later and weaker;
- tap multipliers no longer scale with income;
- Influence grows logarithmically and gives +5% per point.

## Space colonies (endgame)

After the Space Era (about day 25–35) the Govern → Export tab offers **Space Colonies**, a second, endless prestige. Founding a colony resets GDP, sectors, research, eras, Influence and policies. Gems, cosmetics, achievements, the encyclopedia and lifetime GDP stay. Every colony permanently multiplies all income ×3 and research speed ×2, and gives 100 gems (wallet reason `colony`). Each colony adds 60 points to the Tech Index. Colonies are named Moon Base, Mars Colony, Europa Station and so on.

## Seasons

Every calendar month (UTC) is a season. World Ranking → **This season** ranks players by GDP earned during the month (`leaderboard.season`, `season_gdp`, `my_season_rank`).

## Push notifications

Settings → Notifications (or the offer after the first long research project) subscribes the device with Web Push. No account is needed: the device registers with a random id and secret (`push_register`) and sends a short queue of upcoming reminders whenever the game goes to the background (`push_schedule`): research finished, daily reward ready (19:00 or next morning 10:00, local time) and treasury full (offline earnings cap). pg_cron calls the `push-send` Edge Function every 5 minutes; it sends due reminders and forgets devices whose subscription expired. The VAPID key pair is derived on the server from the project's service role key, so there is no extra secret. The service worker does not show a reminder while the game is open on screen. On iPhone and iPad, notifications work only when the game is added to the Home Screen (iOS 16.4+).

## Sharing and invites

Profile and World Ranking have **Share my nation**: a 1080 × 1350 picture with flag, rank, Tech Index, GDP, era and colonies, shared through the phone's share sheet (desktop: the picture is downloaded and the link copied). Signed-in players get an invite link (`?ref=code`, `my_referral_code`). A new player who opens it and signs in within 14 days gets 50 gems, and so does the inviter, for up to 20 friends (`claim_referral`).

## Languages

The game is available in 12 languages: English, Azerbaijani, Turkish, Russian, Spanish, Portuguese, French, German, Arabic (right to left), Hindi, Indonesian and Chinese. Everything is translated, including the encyclopedia, quizzes and national events. The legal pages (`privacy.html`, `terms.html`) stay in English.

- On first launch the game picks the browser's language when it is supported, otherwise English. Players change it in Profile → ⚙ Settings → Language; the page reloads in the new language and progress is kept.
- `i18n.js` holds the runtime. English text is the key: code calls `t('Defense upgraded to level {n}', { n })`, and static text in `index.html` is translated when the page starts. `Text|context` keys (for example `Upgrades|tab`) give the same English word a different, shorter translation.
- Translations live in `i18n/<code>.json` (English → translation). The game loads the generated `lang/<code>.js` for the chosen language only.
- After changing any English text, run:
  - `node tools/i18n.mjs extract` to collect all strings into `i18n/en.json` (needs Playwright, as for the tests);
  - `node tools/i18n.mjs check` to list missing translations and broken `{placeholders}` per language;
  - `node tools/i18n.mjs build` to regenerate `lang/*.js`.

## Files

- `index.html`: app shell, the SVG icon sprite, and the screens
- `content.js`: Tech Encyclopedia cards and quizzes
- `style.css`: visual design, built phone-first and safe-area aware
- `game.js`: game logic, rendering, the canvas skyline, and cloud sync. The balance constants are at the top (`SECTORS`, `COST_GROWTH`, `PRESTIGE_DIVISOR` and others)
- `supabase/functions/push-send/index.ts`: Edge Function that sends push reminders
- `i18n.js`, `i18n/*.json`, `lang/*.js`: translations (see Languages)
- `tools/i18n.mjs`: extracts, checks and builds translations
- `tools/build_single_file.py`: bundles everything, all languages included, into one HTML page. PWA tags are left out

## Next steps

- Tune the balance through playtests: the first 10 minutes and the time to the first export
- Native Android / iOS builds through Capacitor, for real rewarded ads and in-app purchases
