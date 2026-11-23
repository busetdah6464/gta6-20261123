// Azure Cove — a small custom 3D renderer on a 2D canvas (no library, no network).
// The camera chases the player, the city is projected with a perspective divide, and
// boxes are painter-sorted by depth. The HUD, minimap, banners and menus are drawn
// on the same canvas so every screenshot shows the whole game at a glance.

import { CITY, FONT, PALETTE, MISSIONS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';

const TAU = Math.PI * 2;

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1280;
  let H = 720;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(320, Math.floor(rect.width));
    H = Math.max(240, Math.floor(rect.height));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  }

  // ---- 3D projection -------------------------------------------------------
  let camX = 0, camY = 8, camZ = 0, camYaw = 0, focal = 700, horizonY = 0;

  function setupCamera(px, pz, heading, inCar, orbit) {
    if (orbit !== null && orbit !== undefined) {
      camYaw = orbit;
      camX = px - Math.sin(orbit) * 120;
      camZ = pz - Math.cos(orbit) * 120;
      camY = 55;
    } else {
      const back = inCar ? 18 : 13;
      const height = inCar ? 7 : 6;
      camYaw = heading;
      camX = px - Math.sin(heading) * back;
      camZ = pz - Math.cos(heading) * back;
      camY = height;
    }
    focal = H * 0.95;
    horizonY = H * 0.42;
  }

  function project(x, y, z) {
    const dx = x - camX, dz = z - camZ;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    // Camera space: forward is (sin yaw, cos yaw), right is (cos yaw, -sin yaw).
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;
    const depth = rz;
    if (depth < 0.6) return null;
    return { x: W / 2 + (rx / depth) * focal, y: horizonY - ((y - camY) / depth) * focal, depth };
  }

  function poly(points, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
  }

  // Ground points may sit behind the camera: clip the quad against the near
  // plane (rz >= 0.6) instead of mirroring them, so the ground never has holes
  // under the camera and never paints the far side over the screen.
  function toCam(x, y, z) {
    const dx = x - camX, dz = z - camZ;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    return { rx: dx * cos - dz * sin, rz: dx * sin + dz * cos, y };
  }

  function clipNear(points) {
    const out = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const aIn = a.rz >= 0.6;
      const bIn = b.rz >= 0.6;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        const t = (0.6 - a.rz) / (b.rz - a.rz);
        out.push({ rx: a.rx + (b.rx - a.rx) * t, rz: 0.6, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }

  function groundQuad(x1, z1, x2, z2, y, fill) {
    const clipped = clipNear([toCam(x1, y, z1), toCam(x2, y, z1), toCam(x2, y, z2), toCam(x1, y, z2)]);
    if (clipped.length < 3) return;
    poly(clipped.map((p) => ({ x: W / 2 + (p.rx / p.rz) * focal, y: horizonY - ((p.y - camY) / p.rz) * focal })), fill);
  }

  // A box centred at (x, z) with footprint w x d, height h, rotated by yaw.
  function drawBox(x, z, w, h, d, yaw, color) {
    const hw = w / 2, hd = d / 2;
    const corners = [];
    const local = [
      [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
      [-hw, h, -hd], [hw, h, -hd], [hw, h, hd], [-hw, h, hd],
    ];
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    for (const [lx, ly, lz] of local) {
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      corners.push(project(wx, ly, wz));
    }
    if (corners.some((p) => p === null)) return;
    const faces = [
      { idx: [4, 5, 6, 7], f: 1.0 }, // top
      { idx: [1, 2, 6, 5], f: 0.82 },
      { idx: [3, 0, 4, 7], f: 0.62 },
      { idx: [2, 3, 7, 6], f: 0.9 },
      { idx: [0, 1, 5, 4], f: 0.72 },
    ];
    const withDepth = faces.map((face) => {
      let fd = 0;
      for (const i of face.idx) fd += corners[i].depth;
      return { face, fd: fd / 4 };
    });
    withDepth.sort((a, b) => b.fd - a.fd);
    for (const { face } of withDepth) {
      poly(face.idx.map((i) => corners[i]), shade(color, face.f));
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(corners[4].x, corners[4].y);
    ctx.lineTo(corners[5].x, corners[5].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[7].x, corners[7].y);
    ctx.closePath();
    ctx.stroke();
  }

  function drawCircle3D(x, y, z, radius, fill) {
    const p = project(x, y, z);
    if (!p) return;
    const r = Math.max(1, (radius / p.depth) * focal);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
  }

  // ---- sky and ground ------------------------------------------------------
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.45, PALETTE.skyMid);
    g.addColorStop(0.62, PALETTE.skyLow);
    g.addColorStop(0.63, '#cfe8f2');
    g.addColorStop(1, '#8fb8c9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const sx = W * 0.72;
    const sy = H * 0.16;
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.25, 'rgba(255,220,140,0.55)');
    glow.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 100, sy - 100, 200, 200);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 5; i += 1) {
      const cx = ((i * 271 + 90) % 1200) / 1200 * W;
      const cy = 40 + (i % 3) * 34;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 70, 12, 0, 0, TAU);
      ctx.fill();
    }
  }

  function drawGround() {
    // Tiled so a quad is never skipped whole when one of its corners sits
    // behind the camera: each tile is small enough to be fully in front.
    for (let gx = -CITY.half - 90; gx < CITY.half + 90; gx += 180) {
      for (let gz = -CITY.half - 90; gz < CITY.half + 90; gz += 180) {
        groundQuad(gx, gz, gx + 180, gz + 180, 0, PALETTE.grass);
      }
    }
    for (let gz = -CITY.half - 90; gz < CITY.half + 90; gz += 180) {
      groundQuad(CITY.beachX, gz, CITY.half + 90, gz + 180, 0.05, PALETTE.sand);
      groundQuad(CITY.seaX, gz, CITY.half + 270, gz + 180, 0.04, PALETTE.sea);
    }
  }

  function drawRoads(roads) {
    const half = CITY.roadWidth / 2;
    for (const road of roads) {
      if (road.horizontal) {
        for (let x = -CITY.half; x < CITY.beachX; x += 90) {
          groundQuad(x, road.at - half, Math.min(x + 90, CITY.beachX), road.at + half, 0.08, PALETTE.road);
        }
        for (let x = -CITY.half + 10; x < CITY.beachX - 10; x += 36) {
          groundQuad(x, road.at - 0.7, x + 16, road.at + 0.7, 0.1, PALETTE.roadLine);
        }
      } else {
        for (let z = -CITY.half; z < CITY.half; z += 90) {
          groundQuad(road.at - half, z, road.at + half, Math.min(z + 90, CITY.half), 0.08, PALETTE.road);
        }
        for (let z = -CITY.half + 10; z < CITY.half - 10; z += 36) {
          groundQuad(road.at - 0.7, z, road.at + 0.7, z + 16, 0.1, PALETTE.roadLine);
        }
      }
    }
  }

  // ---- HUD -----------------------------------------------------------------
  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function text(str, x, y, size, color, align = 'left', weight = '600') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function drawStar(cx, cy, r, filled) {
    ctx.fillStyle = filled ? '#ffb020' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawMinimap(state) {
    const size = 168;
    const x0 = W - size - 14;
    const y0 = 14;
    const scale = size / (CITY.size + 40);
    const toMap = (x, z) => [x0 + (x + CITY.half + 20) * scale, y0 + (z + CITY.half + 20) * scale];
    panel(x0 - 6, y0 - 6, size + 12, size + 30);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    ctx.fillStyle = '#274b2e';
    ctx.fillRect(x0, y0, size, size);
    const [sx] = toMap(CITY.seaX, 0);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(sx, y0, size, size);
    const [bx] = toMap(CITY.beachX, 0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(bx, y0, sx - bx, size);
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = 3;
    for (const road of state.city.roads) {
      ctx.beginPath();
      if (road.horizontal) {
        const [ax, ay] = toMap(-CITY.half, road.at);
        const [bxx] = toMap(CITY.beachX, road.at);
        ctx.moveTo(ax, ay); ctx.lineTo(bxx, ay);
      } else {
        const [ax, ay] = toMap(road.at, -CITY.half);
        const [, by] = toMap(road.at, CITY.half);
        ctx.moveTo(ax, ay); ctx.lineTo(ax, by);
      }
      ctx.stroke();
    }
    if (state.missionTarget) {
      const [mx, my] = toMap(state.missionTarget.x, state.missionTarget.z);
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(mx, my - 7); ctx.lineTo(mx + 6, my); ctx.lineTo(mx, my + 7); ctx.lineTo(mx - 6, my);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#ff5347';
    for (const cop of state.police) {
      const [cx, cy] = toMap(cop.x, cop.z);
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, TAU); ctx.fill();
    }
    const [px, py] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(state.player.heading), Math.cos(state.player.heading)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    text('AZURE COVE', x0 + size / 2, y0 + size + 16, 11, PALETTE.hudMuted, 'center', '700');
  }

  function drawHUD(state, extra) {
    const pl = state.player;
    panel(14, 14, 250, 74);
    text(`$${pl.cash.toLocaleString('en-US')}`, 28, 42, 22, PALETTE.hudText, 'left', '800');
    text(`Respect ${pl.respect}   •   Misi ${state.missionDone}/5`, 28, 66, 13, PALETTE.hudMuted);
    text(state.allMissionsDone ? 'RAJA COVE' : (MISSIONS[state.missionIndex]?.title ?? ''), 28, 82, 11, PALETTE.accent, 'left', '700');
    for (let i = 0; i < 5; i += 1) drawStar(W / 2 - 56 + i * 28, 34, 11, i < state.wanted);
    if (state.wanted > 0) text('ACPD MENGEJAR', W / 2, 58, 11, '#ff8a80', 'center', '800');
    drawMinimap(state);
    panel(14, H - 78, 240, 64);
    text('NYAWA', 28, H - 52, 11, PALETTE.hudMuted, 'left', '700');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(28, H - 44, 180, 10);
    ctx.fillStyle = pl.health > 30 ? PALETTE.good : PALETTE.danger;
    ctx.fillRect(28, H - 44, 180 * Math.max(0, pl.health / 100), 10);
    text(`${Math.ceil(pl.health)}`, 214, H - 34, 13, PALETTE.hudText, 'left', '700');
    text(`Pistol  ${pl.ammo} peluru   •   Klik: tembak`, 28, H - 20, 11, PALETTE.hudMuted);
    if (!pl.onFoot && pl.car) {
      panel(W - 214, H - 78, 200, 64);
      text(pl.car.model.name, W - 28, H - 62, 11, PALETTE.hudText, 'right', '700');
      const kmh = Math.round(Math.abs(pl.speed) * 3.2);
      text(`${kmh}`, W - 110, H - 30, 30, PALETTE.hudText, 'center', '800');
      text('km/jam', W - 110, H - 16, 11, PALETTE.hudMuted, 'center');
    }
    text(`♪ ${extra.radioStation}  (R: ganti radio)`, W - 14, H - 88, 11, PALETTE.hudMuted, 'right');
    if (extra.objective) {
      const w = Math.min(560, W - 40);
      panel((W - w) / 2, H - 118, w, 30);
      text(extra.objective, W / 2, H - 97, 13, '#ffe14d', 'center', '700');
    }
    if (state.bannerTimer > 0 && state.missionBanner) {
      const w = Math.min(720, W - 80);
      panel((W - w) / 2, 78, w, 46);
      text(state.missionBanner, W / 2, 107, 15, PALETTE.hudText, 'center', '700');
    }
    if (pl.onFoot) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 9, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2 - 14, H / 2); ctx.lineTo(W / 2 - 5, H / 2);
      ctx.moveTo(W / 2 + 5, H / 2); ctx.lineTo(W / 2 + 14, H / 2);
      ctx.moveTo(W / 2, H / 2 - 14); ctx.lineTo(W / 2, H / 2 - 5);
      ctx.moveTo(W / 2, H / 2 + 5); ctx.lineTo(W / 2, H / 2 + 14);
      ctx.stroke();
    }
    if (state.missionTarget) {
      const dx = state.missionTarget.x - pl.x;
      const dz = state.missionTarget.z - pl.z;
      const dist = Math.hypot(dx, dz);
      const rel = Math.atan2(dx, dz) - pl.heading;
      const ax = W / 2 + Math.sin(rel) * 120;
      const ay = state.bannerTimer > 0 ? 150 : 92;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(rel);
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(9, 8); ctx.lineTo(0, 3); ctx.lineTo(-9, 8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      text(`${Math.round(dist)} m`, ax, ay + 26, 11, '#ffe14d', 'center', '700');
    }
  }

  function dim() {
    ctx.fillStyle = 'rgba(6,10,18,0.55)';
    ctx.fillRect(0, 0, W, H);
  }

  function bigPanel(title, lines, accent) {
    const w = Math.min(680, W - 60);
    const h = 130 + lines.length * 26;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    panel(x, y, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, 5);
    text(title, W / 2, y + 52, 40, PALETTE.hudText, 'center', '800');
    lines.forEach((line, i) => text(line, W / 2, y + 92 + i * 26, 15, PALETTE.hudMuted, 'center'));
  }

  // ---- the world itself ------------------------------------------------------
  function drawWorld(state, orbit) {
    const pl = state.player;
    setupCamera(pl.x, pl.z, pl.heading, !pl.onFoot, orbit);
    drawSky();
    drawGround();
    drawRoads(state.city.roads);

    const items = [];
    const depthOf = (x, z) => {
      const dx = x - camX, dz = z - camZ;
      return dx * Math.sin(camYaw) + dz * Math.cos(camYaw);
    };

    for (const b of state.city.buildings) {
      const d = depthOf(b.x, b.z);
      if (d < 0 || d > 420) continue;
      items.push({ d, fn: () => drawBox(b.x, b.z, b.w, b.h, b.d, 0, b.color) });
      if (b.tall) {
        items.push({ d: d - 0.5, fn: () => drawBox(b.x, b.z, b.w + 0.4, 2.2, b.d + 0.4, 0, b.glass) });
      }
    }
    for (const t of state.city.trees) {
      const d = depthOf(t.x, t.z);
      if (d < 0 || d > 380) continue;
      items.push({
        d,
        fn: () => {
          drawBox(t.x, t.z, 0.7, t.h * 0.7, 0.7, 0, '#6b4a2f');
          drawCircle3D(t.x, t.h, t.z, t.palm ? 3.4 : 2.6, t.palm ? '#3f9e4d' : '#4a7d3a');
        },
      });
    }
    for (const car of state.cars) {
      const d = depthOf(car.x, car.z);
      if (d < 0 || d > 380) continue;
      items.push({
        d,
        fn: () => {
          drawBox(car.x, car.z, 2.1, 1.05, 4.6, car.heading, car.color);
          drawBox(car.x, car.z, 1.8, 0.75, 2.4, car.heading, '#1c2733');
          if (car.police) {
            drawBox(car.x, car.z, 1.2, 0.3, 0.8, car.heading, '#ff2d2d');
            drawBox(car.x, car.z, 1.2, 0.3, 0.8, car.heading, '#2d6bff');
          }
          if (car.target) drawCircle3D(car.x, 5.5, car.z, 1.6, '#ff5347');
          if (car.crashed) drawCircle3D(car.x, 1.6, car.z, 2.2, 'rgba(60,60,60,0.6)');
        },
      });
    }
    for (const ped of state.peds) {
      if (!ped.alive) continue;
      const d = depthOf(ped.x, ped.z);
      if (d < 0 || d > 300) continue;
      items.push({
        d,
        fn: () => {
          drawBox(ped.x, ped.z, 0.7, 1.1, 0.45, ped.heading, ped.color);
          drawBox(ped.x, ped.z, 0.5, 0.5, 0.45, ped.heading, '#e8c39a');
        },
      });
    }
    if (pl.onFoot) {
      const d = depthOf(pl.x, pl.z);
      items.push({
        d,
        fn: () => {
          drawBox(pl.x, pl.z, 0.85, 1.25, 0.5, pl.heading, '#2c7de8');
          drawBox(pl.x, pl.z, 0.55, 0.55, 0.5, pl.heading, '#f2c9a0');
        },
      });
    }
    const marker = state.missionActive ? state.missionTarget : (state.allMissionsDone ? null : { x: 0, z: 0 });
    if (marker) {
      const d = depthOf(marker.x, marker.z);
      if (d > 0 && d < 420) {
        items.push({
          d,
          fn: () => {
            const top = project(marker.x, 26, marker.z);
            const base = project(marker.x, 0, marker.z);
            // The light beam only when the marker is properly in front of the
            // camera; a marker almost beside the camera would smear its beam
            // across the whole screen as two diagonal lines.
            if (top && base && Math.abs(base.x - W / 2) < W / 2 + 80 && d > 12) {
              ctx.fillStyle = 'rgba(255,225,77,0.28)';
              ctx.beginPath();
              ctx.moveTo(base.x - 3, base.y);
              ctx.lineTo(top.x - 3, top.y);
              ctx.lineTo(top.x + 3, top.y);
              ctx.lineTo(base.x + 3, base.y);
              ctx.closePath();
              ctx.fill();
            }
            if (d > 25) drawCircle3D(marker.x, 0.4, marker.z, 4, 'rgba(255,225,77,0.5)');
            drawCircle3D(marker.x, 24, marker.z, 2.2, '#ffe14d');
          },
        });
      }
    }
    if (state.missionActive) {
      const m = MISSIONS[state.missionIndex];
      const s = m?.steps[state.missionStep];
      if (s?.type === 'collect') {
        s.points.forEach((p, i) => {
          if (state.cratesDone.includes(i)) return;
          const d = depthOf(p.x, p.z);
          if (d < 0 || d > 380) return;
          items.push({ d, fn: () => drawBox(p.x, p.z, 2, 1.4, 2, 0, '#ffb020') });
        });
      }
    }

    items.sort((a, b) => b.d - a.d);
    for (const item of items) item.fn();
  }

  function draw(state, screen, extra) {
    resize();
    if (screen === SCREEN_TITLE) {
      const t = (extra.titleTime ?? 0) * 0.12;
      drawWorld(state, t);
      dim();
      const w = Math.min(720, W - 60);
      const x = (W - w) / 2;
      const y = H * 0.16;
      text('AZURE COVE', W / 2, y + 84, 76, '#ffffff', 'center', '900');
      text('OPEN-WORLD CRIME DI KOTA PESISIR  •  GTA 6 SPIRIT, KOTA ASLI', W / 2, y + 118, 15, '#ffd9a0', 'center', '700');
      panel(x, y + 150, w, 210);
      text('ENTER — Mulai / Lanjutkan', W / 2, y + 186, 17, PALETTE.hudText, 'center', '700');
      text('WASD jalan & mengemudi  •  E masuk / curi mobil  •  Klik tembak  •  Shift lari', W / 2, y + 216, 14, PALETTE.hudMuted, 'center');
      text('Spasi rem tangan  •  R ganti radio  •  P jeda  •  Misi: tekan E di tanda kuning plaza', W / 2, y + 242, 14, PALETTE.hudMuted, 'center');
      text('5 misi cerita  •  Polisi ACPD & wanted level  •  Save otomatis di browser ini', W / 2, y + 268, 14, PALETTE.hudMuted, 'center');
      text(`Misi selesai ${extra.missionsDone}/5   •   Uang $${extra.cash}   •   Respect ${extra.respect}`, W / 2, y + 300, 14, PALETTE.accent, 'center', '700');
      text('Kota, karakter & cerita asli — bukan GTA Rockstar.', W / 2, y + 336, 12, PALETTE.hudMuted, 'center');
      return;
    }
    drawWorld(state, screen === SCREEN_COMPLETE ? 0.8 : null);
    if (screen === SCREEN_PLAY) {
      drawHUD(state, extra);
      return;
    }
    drawHUD(state, extra);
    dim();
    if (screen === SCREEN_PAUSED) {
      bigPanel('JEDA', ['Tekan P atau Enter untuk lanjut bermain.', 'Progres tersimpan otomatis di browser ini.'], '#ffb020');
    } else if (screen === SCREEN_OVER) {
      bigPanel(extra.overTitle ?? 'TERTANGKAP', extra.overLines ?? ['Polisi ACPD menangkapmu.', 'Tekan Enter untuk lanjut dari safehouse.'], '#ff5347');
    } else if (screen === SCREEN_COMPLETE) {
      bigPanel('MISI SELESAI', extra.overLines ?? ['Kerja bagus. Azure Cove makin mengenal namamu.'], '#4ade80');
    }
  }

  return { draw };
}
