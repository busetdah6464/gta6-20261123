// Azure Cove — the rules and state, with no drawing and no browser in it.
// The player walks or drives a coastal city, steals cars, runs five story missions,
// earns cash and respect, and draws the Azure Cove Police Department when they
// break the law. step() advances one fixed 1/60 s step and reports what happened.

import { CAR, CITY, MISSIONS, MISSION_START, PLAYER, WANTED, CAR_MODELS, POLICE_MODEL } from './config.js';
import { buildCity, nearestRoadPoint, onRoad } from './city.js';
import { pick, range } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_SHOT = 1;
export const EVENT_CRASH = 2;
export const EVENT_MISSION_DONE = 4;
export const EVENT_MISSION_FAIL = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_PICKUP = 64;
export const EVENT_CRIME = 128;

const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    city,
    elapsed: 0,
    player: {
      x: 0, z: 18, heading: Math.PI, speed: 0, health: PLAYER.health,
      ammo: PLAYER.ammoStart, cash: 0, respect: 0, onFoot: true, car: null, moving: false,
    },
    cars: [], peds: [], police: [],
    wanted: 0, wantedTimer: 0, crimeCooldown: 0,
    missionIndex: 0, missionActive: false, missionStep: 0, missionTimer: 0,
    missionTarget: null, targetCar: null, cratesDone: [], ramHits: 0, surviveLeft: 0,
    missionBanner: '', bannerTimer: 0, missionDone: 0, allMissionsDone: false,
    busted: false, wasted: false, shotsFired: 0, carsStolen: 0, distanceDriven: 0,
  };

  function spawnTrafficCar() {
    const p = nearestRoadPoint(range(random, -300, 300), range(random, -300, 300));
    const horizontal = random() < 0.5;
    const model = pick(random, CAR_MODELS);
    return {
      x: p.x, z: p.z, heading: horizontal ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      speed: range(random, 8, 16), targetSpeed: model.top * 0.45, model,
      traffic: true, police: false, parked: false, hp: 100, axis: horizontal ? 'x' : 'z', dir: random() < 0.5 ? 1 : -1,
      color: model.color, crashed: false,
    };
  }

  function spawnPed() {
    const p = nearestRoadPoint(range(random, -300, 300), range(random, -300, 300));
    return {
      x: p.x + range(random, -12, 12), z: p.z + range(random, -12, 12),
      heading: range(random, 0, TAU), speed: range(random, 1.2, 2.4),
      color: pick(random, ['#e86a6a', '#6a9ae8', '#e8c96a', '#8fe86a', '#c96ae8', '#e8e8e8']),
      alive: true, walkPhase: range(random, 0, TAU),
    };
  }

  function spawnPoliceCar() {
    const p = state.player;
    const angle = range(random, 0, TAU);
    const x = clamp(p.x + Math.cos(angle) * 70, -CITY.half + 20, CITY.beachX - 20);
    const z = clamp(p.z + Math.sin(angle) * 70, -CITY.half + 20, CITY.half - 20);
    const car = {
      x, z, heading: Math.atan2(p.x - x, p.z - z) + Math.PI, speed: 20, targetSpeed: WANTED.chaseSpeed,
      model: POLICE_MODEL, traffic: false, police: true, parked: false, hp: 100,
      axis: 'x', dir: 1, color: POLICE_MODEL.color, crashed: false,
    };
    state.police.push(car);
    state.cars.push(car);
    return car;
  }

  function reset() {
    state.elapsed = 0;
    const pl = state.player;
    pl.x = 0; pl.z = 18; pl.heading = Math.PI; pl.speed = 0; pl.health = PLAYER.health;
    pl.ammo = PLAYER.ammoStart; pl.cash = 0; pl.respect = 0; pl.onFoot = true; pl.car = null;
    state.cars = city.parked.map((c) => ({ ...c, hp: 100, crashed: false, color: c.model.color }));
    state.peds = [];
    state.police = [];
    for (let i = 0; i < 14; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < 22; i += 1) state.peds.push(spawnPed());
    state.wanted = 0; state.wantedTimer = 0;
    state.missionIndex = 0; state.missionActive = false; state.missionStep = 0;
    state.missionTarget = null; state.targetCar = null; state.cratesDone = [];
    state.ramHits = 0; state.missionBanner = ''; state.bannerTimer = 0;
    state.missionDone = 0; state.allMissionsDone = false;
    state.busted = false; state.wasted = false;
    state.shotsFired = 0; state.carsStolen = 0; state.distanceDriven = 0;
  }

  function addWanted(stars) {
    if (state.crimeCooldown > 0) return;
    state.crimeCooldown = 4;
    state.wanted = clamp(state.wanted + stars, 0, WANTED.maxStars);
    state.wantedTimer = 0;
  }

  function collideBuildings(x, z, radius) {
    for (const b of city.buildings) {
      const cx = clamp(x, b.x - b.w / 2, b.x + b.w / 2);
      const cz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.001;
        return { x: cx + (dx / d) * radius, z: cz + (dz / d) * radius, hit: true };
      }
    }
    return { x, z, hit: false };
  }

  function nearestCar(x, z, maxDist, predicate) {
    let best = null, bestD = maxDist * maxDist;
    for (const c of state.cars) {
      if (predicate && !predicate(c)) continue;
      const d = dist2(x, z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function currentMission() { return MISSIONS[state.missionIndex] ?? null; }

  function missionStepDef() {
    const m = currentMission();
    return m && state.missionActive ? m.steps[state.missionStep] : null;
  }

  function updateMissionTarget() {
    const step = missionStepDef();
    if (!step) { state.missionTarget = null; return; }
    if (step.type === 'goto') state.missionTarget = { x: step.x, z: step.z };
    else if (step.type === 'collect') {
      const next = step.points.find((p, i) => !state.cratesDone.includes(i));
      state.missionTarget = next ? { x: next.x, z: next.z } : null;
    } else if (step.type === 'ram' && state.targetCar) state.missionTarget = { x: state.targetCar.x, z: state.targetCar.z };
    else if (step.type === 'survive') state.missionTarget = null;
    else state.missionTarget = null;
  }

  function startMission() {
    const m = currentMission();
    if (!m || state.missionActive) return false;
    state.missionActive = true;
    state.missionStep = 0;
    state.ramHits = 0;
    state.cratesDone = [];
    state.missionTimer = m.timeLimit ?? 0;
    state.surviveLeft = 0;
    if (m.wantedAtStart) { state.wanted = m.wantedAtStart; state.wantedTimer = 0; }
    if (m.id === 'payback') {
      const car = {
        x: 180, z: -180, heading: Math.PI / 2, speed: 18, targetSpeed: 26,
        model: { name: 'Rico Sedan', color: '#8a8f98', top: 44 }, traffic: false,
        police: false, parked: false, hp: 999, axis: 'z', dir: 1, color: '#8a8f98', crashed: false,
        target: true,
      };
      state.targetCar = car;
      state.cars.push(car);
    }
    state.missionBanner = `${m.title} — ${m.giver}`;
    state.bannerTimer = 5;
    updateMissionTarget();
    return true;
  }

  function advanceMissionStep() {
    const m = currentMission();
    state.missionStep += 1;
    if (state.missionStep >= m.steps.length) {
      state.missionActive = false;
      state.missionDone += 1;
      state.player.cash += m.reward;
      state.player.respect += m.respect;
      state.missionBanner = `MISI SELESAI — ${m.title}  +$${m.reward}  +${m.respect} respect`;
      state.bannerTimer = 5;
      state.missionIndex += 1;
      if (state.missionIndex >= MISSIONS.length) state.allMissionsDone = true;
      if (state.targetCar) {
        state.cars = state.cars.filter((c) => c !== state.targetCar);
        state.targetCar = null;
      }
      return EVENT_MISSION_DONE;
    }
    const step = m.steps[state.missionStep];
    if (step.type === 'survive') state.surviveLeft = step.seconds;
    updateMissionTarget();
    return EVENT_NONE;
  }

  function failMission(reason) {
    state.missionActive = false;
    state.missionBanner = `MISI GAGAL — ${reason}  Tekan E di plaza untuk mencoba lagi.`;
    state.bannerTimer = 5;
    if (state.targetCar) {
      state.cars = state.cars.filter((c) => c !== state.targetCar);
      state.targetCar = null;
    }
    return EVENT_MISSION_FAIL;
  }

  function enterCar() {
    const pl = state.player;
    const car = nearestCar(pl.x, pl.z, 5, (c) => !c.police);
    if (!car) return false;
    if (car.parked || car.traffic) {
      car.parked = false; car.traffic = false; car.axis = 'x'; car.dir = 1;
      state.carsStolen += 1;
      if (car.parked !== false || true) { /* stealing a car is a crime when police are near */ }
      if (state.police.length > 0 || random() < 0.4) addWanted(1);
    }
    pl.onFoot = false; pl.car = car; pl.heading = car.heading; pl.speed = 0;
    return true;
  }

  function exitCar() {
    const pl = state.player;
    if (!pl.car) return;
    const car = pl.car;
    const side = { x: car.x + Math.cos(car.heading) * 3, z: car.z - Math.sin(car.heading) * 3 };
    pl.x = side.x; pl.z = side.z; pl.onFoot = true; pl.car = null; pl.speed = 0; pl.heading = car.heading;
  }

  function shoot() {
    const pl = state.player;
    if (pl.ammo <= 0) return EVENT_NONE;
    pl.ammo -= 1;
    state.shotsFired += 1;
    addWanted(1);
    const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
    let events = EVENT_SHOT;
    // Nearest ped in the firing cone.
    for (const ped of state.peds) {
      if (!ped.alive) continue;
      const dx = ped.x - pl.x, dz = ped.z - pl.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > PLAYER.pistolRange) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot > 0.94) {
        ped.alive = false;
        state.player.respect = Math.max(0, state.player.respect - 2);
        break;
      }
    }
    // Nearest car in the firing cone takes damage.
    for (const car of state.cars) {
      if (car === pl.car) continue;
      const dx = car.x - pl.x, dz = car.z - pl.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > PLAYER.pistolRange) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot > 0.96) {
        car.hp -= PLAYER.pistolDamage;
        if (car.hp <= 0) { car.crashed = true; car.speed = 0; }
        break;
      }
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (!car.traffic || car.crashed) continue;
      // At an intersection, sometimes turn onto the cross street.
      const onX = Math.abs(((car.x + CITY.half) % CITY.roadGap + CITY.roadGap) % CITY.roadGap - CITY.roadGap / 2) < 2;
      const onZ = Math.abs(((car.z + CITY.half) % CITY.roadGap + CITY.roadGap) % CITY.roadGap - CITY.roadGap / 2) < 2;
      if ((car.axis === 'x' && onX && random() < 0.004) || (car.axis === 'z' && onZ && random() < 0.004)) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.dir = random() < 0.5 ? 1 : -1;
      }
      if (car.axis === 'x') {
        car.heading = car.dir > 0 ? 0 : Math.PI;
        car.x += car.dir * car.speed * dt;
        if (car.x > CITY.beachX - 10) { car.dir = -1; }
        if (car.x < -CITY.half + 10) { car.dir = 1; }
      } else {
        car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.z += car.dir * car.speed * dt;
        if (car.z > CITY.half - 10) { car.dir = -1; }
        if (car.z < -CITY.half + 10) { car.dir = 1; }
      }
      // Slow down for the car ahead on the same road.
      for (const other of state.cars) {
        if (other === car || other.crashed) continue;
        const d = dist2(car.x, car.z, other.x, other.z);
        if (d < 64) { car.speed = Math.max(4, car.speed - 20 * dt); break; }
      }
      car.speed += (car.targetSpeed - car.speed) * 0.4 * dt;
    }
    // The payback target loops around the city on its own route.
    if (state.targetCar && !state.targetCar.crashed) {
      const t = state.targetCar;
      t.z += t.dir * t.speed * dt;
      if (t.z > 300) { t.dir = -1; t.heading = -Math.PI / 2; }
      if (t.z < -300) { t.dir = 1; t.heading = Math.PI / 2; }
      t.x = 180 + Math.sin(state.elapsed * 0.3) * 8;
    }
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (!ped.alive) continue;
      ped.walkPhase += dt * 6;
      if (random() < 0.002) ped.heading = range(random, 0, TAU);
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      if (ped.x > CITY.beachX - 4) ped.heading = Math.PI + range(random, -0.6, 0.6);
      if (ped.x < -CITY.half + 6) ped.heading = range(random, -0.6, 0.6);
      if (ped.z > CITY.half - 6) ped.heading = Math.PI + range(random, -0.6, 0.6);
      if (ped.z < -CITY.half + 6) ped.heading = range(random, -0.6, 0.6);
      const fixed = collideBuildings(ped.x, ped.z, 1);
      ped.x = fixed.x; ped.z = fixed.z;
    }
  }

  function stepPolice(dt) {
    const pl = state.player;
    const wantCount = Math.min(state.wanted * WANTED.policePerStar, 4);
    while (state.police.length < wantCount) spawnPoliceCar();
    while (state.police.length > wantCount) {
      const old = state.police.pop();
      state.cars = state.cars.filter((c) => c !== old);
    }
    for (const cop of state.police) {
      if (cop.crashed) continue;
      const dx = pl.x - cop.x, dz = pl.z - cop.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      cop.heading += clamp(angleDiff(wantHeading, cop.heading), -2.6 * dt, 2.6 * dt);
      cop.speed += (WANTED.chaseSpeed - cop.speed) * 0.8 * dt;
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      const fixed = collideBuildings(cop.x, cop.z, 2.4);
      cop.x = fixed.x; cop.z = fixed.z;
      if (d < WANTED.bustedRadius && Math.abs(pl.speed) < WANTED.bustSpeed && !pl.onFoot) {
        state.busted = true;
        return EVENT_BUSTED;
      }
      if (d < 2.2 && pl.onFoot) {
        state.busted = true;
        return EVENT_BUSTED;
      }
    }
    return EVENT_NONE;
  }

  function stepPlayer(dt, input) {
    const pl = state.player;
    pl.moving = false;
    if (pl.onFoot) {
      // A turns left (heading grows, south toward east), D turns right — the
      // same sense as driving, so the controls never flip between modes.
      const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      pl.heading += turn * PLAYER.turnSpeed * dt;
      const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const speedTarget = forward === 0 ? 0 : (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed) * forward;
      pl.speed += (speedTarget - pl.speed) * Math.min(1, PLAYER.accel * dt / 10);
      if (Math.abs(pl.speed) > 0.5) pl.moving = true;
      pl.x += Math.sin(pl.heading) * pl.speed * dt;
      pl.z += Math.cos(pl.heading) * pl.speed * dt;
      const fixed = collideBuildings(pl.x, pl.z, PLAYER.radius);
      pl.x = fixed.x; pl.z = fixed.z;
      pl.x = clamp(pl.x, -CITY.half + 4, CITY.beachX + 40);
      pl.z = clamp(pl.z, -CITY.half + 4, CITY.half - 4);
    } else if (pl.car) {
      const car = pl.car;
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      const accel = input.forward ? CAR.accel : input.back ? -CAR.brake : 0;
      car.speed += accel * dt;
      if (!input.forward && !input.back) car.speed -= Math.sign(car.speed) * 8 * dt;
      if (input.brake) car.speed -= Math.sign(car.speed) * 30 * dt;
      car.speed = clamp(car.speed, -CAR.maxReverse, car.model.top);
      const dir = car.speed >= 0 ? 1 : -1;
      // Steering stays responsive at low speed (min 0.35) so a car can turn
      // out of a tight spot instead of bouncing against the same wall.
      car.heading += steer * CAR.turnSpeed * dt * dir * clamp(Math.abs(car.speed) / 12, 0.35, 1);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const fixed = collideBuildings(nx, nz, 2.4);
      if (fixed.hit && Math.abs(car.speed) > 8) {
        car.speed *= -0.25;
        pl.health -= CAR.damageOnHit * 0.4;
      } else {
        car.x = fixed.x; car.z = fixed.z;
      }
      car.x = clamp(car.x, -CITY.half + 4, CITY.beachX + 30);
      car.z = clamp(car.z, -CITY.half + 4, CITY.half - 4);
      pl.x = car.x; pl.z = car.z; pl.heading = car.heading; pl.speed = car.speed;
      if (Math.abs(car.speed) > 1) { pl.moving = true; state.distanceDriven += Math.abs(car.speed) * dt; }
      // Ram other cars: separate the two cars once, and only cut speed when
      // actually moving fast — never multiply the speed down every frame while
      // the cars still overlap, or the car can never drive away.
      for (const other of state.cars) {
        if (other === car || other.crashed) continue;
        const dx = car.x - other.x, dz = car.z - other.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 16 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (4 - d) / 2;
          car.x += (dx / d) * push;
          car.z += (dz / d) * push;
          other.x -= (dx / d) * push;
          other.z -= (dz / d) * push;
          other.hp -= 20;
          if (other.hp <= 0) { other.crashed = true; other.speed = 0; }
          if (other.target) {
            state.ramHits += 1;
            state.missionBanner = `TABRAKAN! ${state.ramHits}/3 — terus tabrak sedan Rico!`;
            state.bannerTimer = 2;
          }
          if (Math.abs(car.speed) > 5) car.speed *= 0.55;
        }
      }
      // Hitting a pedestrian while driving is a crime.
      for (const ped of state.peds) {
        if (!ped.alive) continue;
        if (dist2(car.x, car.z, ped.x, ped.z) < 9) {
          ped.alive = false;
          addWanted(1);
        }
      }
    }
    if (pl.health <= 0) {
      state.wasted = true;
      return EVENT_WASTED;
    }
    return EVENT_NONE;
  }

  function stepMission(dt) {
    if (!state.missionActive) return EVENT_NONE;
    const m = currentMission();
    const step = missionStepDef();
    if (!step) return EVENT_NONE;
    if (m.timeLimit) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) return failMission('Waktu habis.');
    }
    const pl = state.player;
    if (step.type === 'goto') {
      if (dist2(pl.x, pl.z, step.x, step.z) < 64) return advanceMissionStep();
    } else if (step.type === 'enter') {
      if (!pl.onFoot) return advanceMissionStep();
    } else if (step.type === 'ram') {
      if (state.ramHits >= step.count) return advanceMissionStep();
    } else if (step.type === 'survive') {
      state.surviveLeft += dt;
      if (state.surviveLeft >= step.seconds) return advanceMissionStep();
    } else if (step.type === 'collect') {
      step.points.forEach((p, i) => {
        if (!state.cratesDone.includes(i) && dist2(pl.x, pl.z, p.x, p.z) < 36) {
          state.cratesDone.push(i);
          state.player.cash += 50;
          state.missionBanner = `Peti ${state.cratesDone.length}/${step.points.length} didapat! +$50`;
          state.bannerTimer = 2;
        }
      });
      if (state.cratesDone.length >= step.points.length) return advanceMissionStep();
    }
    updateMissionTarget();
    return EVENT_NONE;
  }

  function step(dt, input) {
    let events = EVENT_NONE;
    state.elapsed += dt;
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.player.health < PLAYER.health && state.wanted === 0) {
      state.player.health = Math.min(PLAYER.health, state.player.health + 1.2 * dt);
    }
    if (input.interact) {
      let started = false;
      if (!state.missionActive && !state.allMissionsDone) {
        if (dist2(state.player.x, state.player.z, MISSION_START.x, MISSION_START.z) < 100) started = startMission();
      }
      if (!started && state.player.onFoot) enterCar();
    }
    if (input.exit && !state.player.onFoot) exitCar();
    if (input.shoot && state.player.onFoot) events |= shoot();
    events |= stepPlayer(dt, input);
    stepTraffic(dt);
    stepPeds(dt);
    if (state.wanted > 0) {
      events |= stepPolice(dt);
      state.wantedTimer += dt;
      const nearestCop = state.police.reduce((best, c) => Math.min(best, Math.sqrt(dist2(c.x, c.z, state.player.x, state.player.z))), 999);
      if (state.wantedTimer > WANTED.decaySeconds && nearestCop > 60) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        if (state.wanted === 0) {
          state.cars = state.cars.filter((c) => !c.police);
          state.police = [];
        }
      }
    }
    events |= stepMission(dt);
    if (state.busted) {
      state.busted = false;
      state.player.cash = Math.max(0, state.player.cash - 100);
      state.wanted = 0;
      state.police = [];
      state.player.health = PLAYER.health;
      if (state.player.car) { state.player.car = null; }
      state.player.onFoot = true;
      state.player.x = -225; state.player.z = -225; state.player.heading = 0; state.player.speed = 0;
      return events | EVENT_BUSTED;
    }
    if (state.wasted) {
      state.wasted = false;
      state.player.cash = Math.max(0, state.player.cash - 150);
      state.wanted = 0;
      state.police = [];
      state.player.health = PLAYER.health;
      state.player.onFoot = true;
      state.player.x = 0; state.player.z = 18; state.player.speed = 0;
      return events | EVENT_WASTED;
    }
    return events;
  }

  function serialize() {
    return {
      cash: state.player.cash, respect: state.player.respect, missionIndex: state.missionIndex,
      missionDone: state.missionDone, carsStolen: state.carsStolen,
      distanceDriven: Math.round(state.distanceDriven), shotsFired: state.shotsFired,
    };
  }

  function applySave(save) {
    if (!save) return;
    state.player.cash = save.cash | 0;
    state.player.respect = save.respect | 0;
    state.missionIndex = save.missionIndex | 0;
    state.missionDone = save.missionDone | 0;
    state.carsStolen = save.carsStolen | 0;
    state.distanceDriven = save.distanceDriven | 0;
    state.shotsFired = save.shotsFired | 0;
    if (state.missionIndex >= MISSIONS.length) state.allMissionsDone = true;
  }

  reset();
  return {
    state, reset, step, startMission, enterCar, exitCar, shoot, currentMission, missionStepDef,
    updateMissionTarget, serialize, applySave, addWanted,
    missionStartPos: MISSION_START,
  };
}
