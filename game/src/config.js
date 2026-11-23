// Azure Cove — every tuning number, colour and story beat in one place.
// The city is a 720 x 720 unit coastal grid: roads every 90 units, the beach and
// the sea on the east edge, the marina in the south-east, the hills in the north-west.

export const STEP = 1 / 60;
export const CITY = { size: 720, half: 360, roadGap: 90, roadWidth: 16, beachX: 330, seaX: 372 };
export const SAVE_KEY = 'azure-cove.save.v1';
export const BEST_KEY = 'azure-cove.best.v1';

export const PLAYER = {
  walkSpeed: 9, runSpeed: 15, accel: 40, turnSpeed: 5.2,
  health: 100, radius: 1.1, pistolRange: 55, pistolDamage: 34, ammoStart: 24,
};

export const CAR = {
  accel: 26, brake: 42, reverseAccel: 14, maxSpeed: 46, maxReverse: 12,
  turnSpeed: 2.4, grip: 6, length: 4.6, width: 2.1, damageOnHit: 12,
};

export const WANTED = {
  decaySeconds: 22, maxStars: 5, policePerStar: 1, chaseSpeed: 40,
  bustedRadius: 3.4, bustSpeed: 6, sirenRange: 120,
};

export const PALETTE = {
  skyTop: '#2f6fb8', skyMid: '#7fb6e4', skyLow: '#ffd9a0', sun: '#fff3c4',
  sea: '#1e7fa8', sand: '#e8cf9a', grass: '#5d9b4a', road: '#3a3f47', roadLine: '#e8d44d',
  sidewalk: '#9aa0a8', buildingGlass: '#7fc4e8', hudText: '#f4f6f8', hudMuted: '#c8d0d8',
  panel: 'rgba(10,16,26,0.72)', accent: '#ffb020', danger: '#ff5347', good: '#4ade80',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Car models the city spawns. Names, colours and owners are all invented for Azure Cove.
export const CAR_MODELS = [
  { name: 'Cove Comet', color: '#e8452c', top: 48 },
  { name: 'Marina GT', color: '#2c7de8', top: 50 },
  { name: 'Palm Cruiser', color: '#f2c94c', top: 44 },
  { name: 'Dune Runner', color: '#37b06a', top: 46 },
  { name: 'Sunset Coupe', color: '#b45ae0', top: 49 },
  { name: 'Harbor Van', color: '#e8e8e8', top: 38 },
  { name: 'Coral Taxi', color: '#ffb020', top: 44 },
  { name: 'Night Sedan', color: '#22262e', top: 47 },
];
export const POLICE_COLOR = '#e8eef4';
export const POLICE_MODEL = { name: 'ACPD Interceptor', color: POLICE_COLOR, top: 52 };

// Districts, only for flavour text, the minimap legend and mission briefings.
export const DISTRICTS = [
  { name: 'Marina Bay', x: 240, z: 240 }, { name: 'Old Pier', x: 300, z: -40 },
  { name: 'Palm Row', x: 60, z: 180 }, { name: 'Cove Heights', x: -180, z: -200 },
  { name: 'Sunset Strip', x: -60, z: 60 }, { name: 'Fish Market', x: 180, z: -240 },
];

// Five story missions. A step is one objective; the world engine walks them in order.
// type: goto (reach the marker), enter (get in any car), ram (hit the target car N times),
// survive (stay alive / un-busted for the timer), collect (visit each crate).
export const MISSIONS = [
  {
    id: 'first-wheels', title: 'MISI 1 — FIRST WHEELS', giver: 'Mara, pemilik bengkel',
    brief: 'Mara butuh mobil untuk bengkelnya. Curi satu mobil di jalan, lalu antar ke garasi Mara.',
    reward: 250, respect: 10,
    steps: [
      { type: 'goto', x: 10, z: 45, label: 'Pergi ke mobil yang diparkir di Palm Row (tanda kuning)' },
      { type: 'enter', label: 'Masuk ke mobil — tekan E di dekat mobil' },
      { type: 'goto', x: -90, z: 135, label: 'Antar mobil ke Garasi Mara di Sunset Strip' },
    ],
  },
  {
    id: 'beach-run', title: 'MISI 2 — BEACH RUN', giver: 'Dito, kurir pantai',
    brief: 'Paket untuk Old Pier harus sampai sebelum matahari terbenam. Jangan tanya isinya.',
    reward: 400, respect: 15, timeLimit: 75,
    steps: [
      { type: 'goto', x: 270, z: -90, label: 'Antar paket ke Old Pier sebelum waktu habis' },
    ],
  },
  {
    id: 'payback', title: 'MISI 3 — PAYBACK', giver: 'Mara',
    brief: 'Si pengkhianat Rico kabur dengan sedan abu-abu. Tabrak mobilnya 3 kali sampai dia menyerah.',
    reward: 600, respect: 20,
    steps: [
      { type: 'ram', count: 3, label: 'Tabrak sedan abu-abu Rico 3 kali (tanda merah)' },
    ],
  },
  {
    id: 'heat-wave', title: 'MISI 4 — HEAT WAVE', giver: 'Dito',
    brief: 'Polisi Cove mengincarmu. Bertahan dari kejaran, lalu kabur ke safehouse di Cove Heights.',
    reward: 800, respect: 25, wantedAtStart: 3,
    steps: [
      { type: 'survive', seconds: 20, label: 'Bertahan dari kejaran polisi selama 20 detik' },
      { type: 'goto', x: -180, z: -180, label: 'Kabur ke safehouse di Cove Heights' },
    ],
  },
  {
    id: 'cove-crown', title: 'MISI 5 — COVE CROWN', giver: 'Mara & Dito',
    brief: 'Tiga peti terakhir tersebar di kota. Ambil semuanya, lalu bawa ke marina. Jadilah raja Cove.',
    reward: 1500, respect: 40,
    steps: [
      { type: 'collect', points: [{ x: 180, z: -180 }, { x: -180, z: 180 }, { x: 90, z: -180 }], label: 'Ambil 3 peti di Fish Market, Palm Row dan Cove Heights' },
      { type: 'goto', x: 270, z: 270, label: 'Bawa peti ke Marina Bay — selesaikan Azure Cove' },
    ],
  },
];

export const MISSION_START = { x: 0, z: 0 }; // plaza tengah kota, tempat misi dimulai
export const GARAGE_POS = { x: -90, z: 135 };
export const SAFEHOUSE_POS = { x: -180, z: -180 };
export const MARINA_POS = { x: 270, z: 270 };

export const RADIO_STATIONS = [
  { name: 'COVE FM 88.2 — Sunset Drive', bpm: 96, root: 220 },
  { name: 'PALM 101.5 — Night Bass', bpm: 122, root: 110 },
  { name: 'MARINA 94.0 — Island Breeze', bpm: 80, root: 262 },
];
