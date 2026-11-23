// Azure Cove — the screenshot scenes behind ?shot=start|play|chase|end.
// Each one plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a grid autopilot (drive along the road grid, turn at
// intersections, then onto the marker), so the frame is what a short game really
// looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** The nearest road-grid line (roads run every 90 units, offset -360). */
function snapRoad(v) {
  return Math.round((v + 360) / 90) * 90 - 360;
}

/**
 * Waypoints from the player's spot to (tx, tz) that stay on roads: first to the
 * nearest intersection, then along one road to the target's road, then along
 * that road to the target. A target sitting on a vertical (or horizontal) road
 * is approached straight down that road — no detour to the far intersection.
 */
function planRoute(px, pz, tx, tz) {
  const ix = snapRoad(px);
  const iz = snapRoad(pz);
  const txr = snapRoad(tx);
  const tzr = snapRoad(tz);
  const points = [{ x: ix, z: iz }];
  if (Math.abs(tx - txr) < 20) {
    // Target is on (or near) a vertical road: reach that road, then drive down it.
    if (Math.abs(ix - txr) > 1) points.push({ x: txr, z: iz });
  } else if (Math.abs(tz - tzr) < 20) {
    // Target is on (or near) a horizontal road: reach that road, then drive along it.
    if (Math.abs(iz - tzr) > 1) points.push({ x: ix, z: tzr });
  } else {
    if (Math.abs(ix - txr) > 1) points.push({ x: txr, z: iz });
    points.push({ x: txr, z: tzr });
  }
  points.push({ x: tx, z: tz });
  return points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 4);
}

function makeDriver() {
  let route = null;
  let routeKey = '';
  return function drive(state) {
    const pl = state.player;
    const target = state.missionTarget ?? { x: 0, z: 0 };
    const key = `${target.x},${target.z}`;
    if (!route || routeKey !== key) {
      route = planRoute(pl.x, pl.z, target.x, target.z);
      routeKey = key;
    }
    while (route.length > 1 && Math.hypot(route[0].x - pl.x, route[0].z - pl.z) < 10) route.shift();
    const wp = route[0] ?? target;
    const want = Math.atan2(wp.x - pl.x, wp.z - pl.z);
    const diff = angleDiff(want, pl.heading);
    const distWp = Math.hypot(wp.x - pl.x, wp.z - pl.z);
    return {
      forward: true, back: false,
      left: diff > 0.1, right: diff < -0.1,
      // Brake into a turn instead of overshooting the corner at full speed.
      run: false, brake: Math.abs(diff) > 1.4 || (distWp < 30 && Math.abs(diff) > 0.6), interact: false, exit: false, shoot: false,
    };
  };
}

function idleInput() {
  return { forward: false, back: false, left: false, right: false, run: false, brake: false, interact: false, exit: false, shoot: false };
}

/** Put the player in a parked car, moved to (x, z) first so the shot is exact. */
function putPlayerInCar(world, x, z, heading) {
  const state = world.state;
  const pl = state.player;
  const parked = state.cars.find((c) => c.parked) ?? state.cars[0];
  parked.x = x; parked.z = z; parked.heading = heading;
  parked.parked = false; parked.traffic = false; parked.speed = 0;
  pl.x = x; pl.z = z; pl.heading = heading; pl.onFoot = false; pl.car = parked; pl.speed = 0;
}

/**
 * Set `world` to the named scene (start, play, chase or end; any other name is
 * start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, idleInput());
    return { screen: SCREEN_TITLE };
  }

  if (name === 'end') {
    world.startMission();
    const drive = makeDriver();
    // Walk to the parked car, steal it, drive it to Mara's garage — for real,
    // through the mission engine, so the completion is earned by the rules.
    const pl = state.player;
    pl.x = 0; pl.z = 18; pl.heading = 0;
    for (let i = 0; i < 60 * 20 && state.missionActive; i += 1) {
      const step = world.missionStepDef();
      if (step?.type === 'goto' && step.x === 10 && step.z === 45) {
        const want = Math.atan2(10 - pl.x, 45 - pl.z);
        const diff = angleDiff(want, pl.heading);
        world.step(STEP, {
          forward: true, back: false, left: diff > 0.1, right: diff < -0.1,
          run: true, brake: false, interact: false, exit: false, shoot: false,
        });
      } else if (step?.type === 'enter') {
        world.step(STEP, { ...idleInput(), interact: true });
      } else {
        world.step(STEP, drive(state));
      }
      if (!state.missionActive && state.missionDone >= 1) break;
    }
    if (state.missionDone >= 1) {
      state.missionBanner = 'MISI SELESAI — MISI 1 — FIRST WHEELS  +$250  +10 respect';
    } else {
      state.missionBanner = 'MISI 1 — FIRST WHEELS — antar mobil ke Garasi Mara';
    }
    state.bannerTimer = 99;
    return {
      screen: SCREEN_COMPLETE,
      overLines: [
        'MISI 1 — FIRST WHEELS selesai: mobil curian diantar ke Garasi Mara.',
        `Uang $${state.player.cash}  •  Respect ${state.player.respect}  •  Misi ${state.missionDone}/5`,
        'Misi 2 — BEACH RUN menunggu di plaza. Azure Cove makin mengenal namamu.',
      ],
    };
  }

  if (name === 'chase') {
    putPlayerInCar(world, 0, -90, 0);
    state.wanted = 3;
    state.wantedTimer = 0;
    const drive = makeDriver();
    for (let i = 0; i < 180; i += 1) {
      world.step(STEP, { ...drive(state), forward: true });
      if (state.wanted < 3) { state.wanted = 3; state.wantedTimer = 0; }
      // A bust mid-shot would teleport the player to the safehouse on foot;
      // put them straight back in a car so the shot stays a chase.
      if (state.player.onFoot) putPlayerInCar(world, state.player.x, state.player.z, state.player.heading);
    }
    // Pull the pursuing cars into the frame: two flanking just behind the
    // player (ahead of the chase camera) and one coming up the road ahead.
    if (state.player.onFoot) putPlayerInCar(world, state.player.x, state.player.z, state.player.heading);
    state.wanted = 3;
    const h = state.player.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const spots = [
      { along: -10, side: 8 }, { along: -14, side: -8 }, { along: 28, side: -6 },
    ];
    state.police.forEach((cop, i) => {
      const spot = spots[i % spots.length];
      cop.x = state.player.x + fx * spot.along + rx * spot.side;
      cop.z = state.player.z + fz * spot.along + rz * spot.side;
      cop.heading = state.player.heading;
      cop.speed = 30;
    });
    state.missionBanner = 'ACPD MENGEJAR — wanted ★★★ — kabur dari kejaran!';
    state.bannerTimer = 99;
    return { screen: SCREEN_PLAY };
  }

  // play: mission 1 in progress, driving the stolen car through the city.
  world.startMission();
  putPlayerInCar(world, 10, 45, Math.PI / 2);
  const drive = makeDriver();
  for (let i = 0; i < 60 * 10; i += 1) {
    world.step(STEP, drive(state));
    if (!state.missionActive) break;
  }
  return { screen: SCREEN_PLAY };
}
