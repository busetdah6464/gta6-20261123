// Azure Cove — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between title, play, paused, busted/wasted and mission-complete screens,
// and saves progress (cash, respect, missions) to localStorage after every mission.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.

import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_SHOT, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261123;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
// Debug hook for play-testing in the browser console (harmless in the shipped game).
window.__azure = world;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize()));
    window.localStorage.setItem(BEST_KEY, String(world.state.player.cash));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function objectiveText() {
  const state = world.state;
  if (state.missionActive) {
    const step = world.missionStepDef();
    let label = step?.label ?? '';
    if (state.missionTimer > 0) label += `  —  ${Math.ceil(state.missionTimer)} dtk`;
    if (step?.type === 'survive') label += `  —  ${Math.ceil(state.surviveLeft)} / ${step.seconds} dtk`;
    if (step?.type === 'ram') label += `  —  ${state.ramHits}/${step.count}`;
    return label;
  }
  if (state.allMissionsDone) return 'Semua misi selesai — jelajahi Azure Cove sesukamu!';
  return 'Pergi ke tanda kuning di plaza, tekan E untuk misi berikutnya';
}

function extraForDraw(screen, over) {
  return {
    radioStation: audio.stationName(),
    objective: screen === SCREEN_PLAY ? objectiveText() : null,
    missionsDone: world.state.missionDone,
    cash: world.state.player.cash,
    respect: world.state.player.respect,
    titleTime: world.state.elapsed,
    overTitle: over?.title,
    overLines: over?.lines,
  };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, {
      radioStation: 'COVE FM 88.2 — Sunset Drive',
      objective: scene.screen === SCREEN_PLAY ? objectiveText() : null,
      missionsDone: world.state.missionDone,
      cash: world.state.player.cash,
      respect: world.state.player.respect,
      titleTime: 12,
      overTitle: 'MISI SELESAI',
      overLines: scene.overLines,
    });
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let over = null;
  let accumulator = 0;
  let last = performance.now();

  const save = readSave();
  if (save) world.applySave(save);

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.state.missionActive = false;
    screen = SCREEN_PLAY;
    announce('Bermain di Azure Cove. Pergi ke tanda kuning di plaza untuk misi pertama.');
  }

  function endGame(title, lines) {
    screen = SCREEN_OVER;
    over = { title, lines };
    writeSave();
    announce(`${title}. ${lines[0]}`);
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_MISSION_DONE) {
      audio.missionDone();
      writeSave();
      announce(`Misi selesai. Uang $${world.state.player.cash}.`);
      if (world.state.allMissionsDone) {
        screen = SCREEN_COMPLETE;
        over = {
          title: 'RAJA COVE',
          lines: [
            'Semua 5 misi selesai. Azure Cove adalah kotamu sekarang.',
            `Uang $${world.state.player.cash}  •  Respect ${world.state.player.respect}`,
            'Tekan Enter untuk terus menjelajahi kota.',
          ],
        };
      }
    }
    if (events & EVENT_MISSION_FAIL) announce('Misi gagal. Coba lagi dari plaza.');
    if (events & EVENT_BUSTED) {
      endGame('TERTANGKAP', [
        'Polisi ACPD menangkapmu. Denda $100.',
        `Uang sekarang $${world.state.player.cash}.`,
        'Tekan Enter untuk lanjut dari safehouse.',
      ]);
    } else if (events & EVENT_WASTED) {
      endGame('KAMU TUMBANG', [
        'Kamu tumbang dan bangun di plaza. Biaya rumah sakit $150.',
        `Uang sekarang $${world.state.player.cash}.`,
        'Tekan Enter untuk lanjut bermain.',
      ]);
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const held = input.read();
    if (input.takeRadio()) audio.nextStation();
    if (input.takeMute()) audio.toggleMute();
    const events = world.step(STEP, held);
    input.clearOneShots();
    handleEvents(events);
    const pl = world.state.player;
    audio.setEngine(pl.onFoot ? 0 : Math.abs(pl.speed) / 50);
    audio.setSiren(world.state.wanted > 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_COMPLETE) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Jeda.'); }
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (screen === SCREEN_TITLE) {
      world.state.elapsed += STEP;
      while (accumulator >= STEP) accumulator -= STEP;
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) { step(); accumulator -= STEP; }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, extraForDraw(screen, over));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });

  announce('Azure Cove. Tekan Enter untuk mulai.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
