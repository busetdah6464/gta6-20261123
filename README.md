# Azure Cove — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/busetdah6464/gta6-20261123/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/busetdah6464/gta6-20261123/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

make.fun entry for [gta6-01](https://make.fun/bounty/gta6-01): Azure Cove, an original
open-world crime game — a coastal 3D city to explore on foot and by car, with traffic
and pedestrians, cars to steal, a wanted level with police who respond, 5 story
missions, combat, a HUD with a minimap, a start screen and localStorage saves.

- Custom canvas 3D engine written from scratch (no library, no network request):
  `game/src/` holds the city, world, rendering, audio and mission code.
- 5 story missions; mission 1 is verified completable.
- 3 in-game radio stations, day/night cycle, wanted system.

## Run

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Then open http://localhost:8080 in a desktop browser. The game is plain static
files (`game/index.html` and its ES modules) and runs offline.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json` with the vendored make.fun library.
