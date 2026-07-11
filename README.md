# Born Into

A real-time, top-down, grid-based **generational life-simulation** for the browser.
You live one continuous life — birth to old age — in a small procedurally seeded town,
raised (or neglected) by autonomous NPC parents with their own personalities, needs,
schedules, and struggles. When you die, you choose one of your children and keep going.

No engine, no build step: vanilla HTML5 Canvas + ES modules. All pixel-art sprites are
generated from tiny pixel maps in code (`src/engine/sprites.js`), so the repo ships no
binary assets. Progress autosaves to `localStorage` and survives reloads.

## Run it

Any static file server works (ES modules + `fetch` need HTTP, not `file://`):

```sh
npm start                      # npx http-server -p 8000
# or
python3 -m http.server 8000
```

Then open http://localhost:8000

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move (from toddler stage on) |
| E | Interact with nearby object/person |
| C | Cry (baby) / tantrum (toddler) |
| G | Walk to school / go to work |
| T, N, M, B | Stage-specific actions (shown on buttons) |
| Space / P | Pause |
| 1 / 2 / 3 | Pause / 1× / 3× speed |

Time scale: **one game day = one year of life** (~96s at 1× speed). Days still have a
full 24h cycle, so schedules (school 8–15, work 9–17, sleep) play out inside each "year".

## The life

1. **Baby (0–2)** — fully passive; you go wherever a parent carries you, or you don't.
   One verb: *cry* — a real but never guaranteed chance to summon a parent, gated by
   their live stress/patience. Bonding, stimulation, and stress exposure accumulate in
   the background and seed your trait pool. If care bottoms out, a social worker is
   dispatched in real time — removal to the group home is a live possibility every
   playthrough, driven purely by the parents your seed rolled.
2. **Toddler (2–5)** — first free movement, house-only unless escorted. Curiosity grows
   from poking at things; the stove, the stairs, and an unlocked front door carry real
   injury/death risk when unsupervised. Park playdates can seed a persistent friend.
3. **Child (5–12)** — school runs weekdays; truancy flags the family with social
   services. Friendships and rivalries persist. Bullying follows a real escalation path
   (ignored → repeated → physical → serious) shaped by your relationships and trait
   seeds; witnessed fights pull in the school or the police, and police contact loops
   back onto the family's file.
4. **Teen (13–18)** — personality locks in and is shown back to you. Choose the
   part-time job (hard-capped minimum wage, no exceptions) or the college track (no
   income, better ceilings). Romance can lead to teen pregnancy — spawning a real baby
   run by the same care systems, with you stacked into the parent role. Sneak out at
   night: whether you're caught depends on who your parents are.
5. **Adult (18+)** — career from your education path, housing on the same wealth-tier
   ladder your parents rolled, marriage, kids. Your character now runs the same
   needs/stress "parent-agent brain" as every NPC parent.
6. **Old age → death** — natural threshold or accumulated damage, whichever wins.
   Then: pick a child, inherit their already-lived childhood (their stats were being
   tracked the whole time), and continue. No children — the line ends.

Traits are never chosen: they're revealed at stage transitions from what actually
happened to you, and they bias event odds and options rather than hard-gating them.

## Architecture

```
src/
  main.js               game init, loop, world/family creation, hand-off
  constants.js          tile enum, time scale, life stages
  engine/               grid + BFS pathfinding, code-gen sprites, renderer, save
  world/                seeded town gen, wealth-tier house templates, civic panels
  agents/               base agent, utility-AI (parents/kids/social worker),
                        relationships, schedule helpers
  character/            player controller, stage modules, traits, stats
  events/               weighted life-event pool, bullying escalation chain
  family/               lineage tracking + heir selection, pregnancy/births
  ui/                   DOM HUD, modal choice menu, building panels
assets/data/            traits.json, events.json, houseTemplates.json (tunable)
```

Design notes:

- **agents/ vs character/**: NPC parents and the player share the agent shape (needs,
  traits, position, household). The player just isn't driven by `parentAI`. When the
  generational hand-off makes your old adult an NPC, no conversion is needed.
  *Known refactor point:* `character/stages/adult.js` and `agents/parentAI.js`
  intentionally mirror each other and should eventually converge.
- **State/runtime split**: everything in `game.state` is plain JSON — saving is one
  `JSON.stringify`. Sprites, input, and the block-set are rebuilt on load.
- **Balance lives in data**: traits, events, and house templates are JSON so odds and
  layouts can be tuned without touching logic.

## Debug helpers

In the console: `BI.game` (full state), `BI.skipYears(n)` (fast-forward stage
transitions), `BI.newGame(seed)` (reproducible town from a seed).
