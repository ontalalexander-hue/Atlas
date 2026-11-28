// The floor plan, laid out for the owner's room plan (GET /api/office/world). The code knows room *kinds* only: CEO
// office, growth HQ, sales room, a separate wing, market hall, church, personal suite, library, studio and server room,
// plus the shared rooms (conference, reception, sick bay). What each is called, which helper sits where, which other
// agents have a desk and what a room shows all come from the plan, which lives in the owner's settings, never here.
import { tr } from './i18n.js';

// Rol nomidan xona turi
export function kindOf(id = '') {
  const n = id.toLowerCase();
  if (/flutter|mobile|ios|android|dart|react-?native|expo|kotlin|swift/.test(n)) return 'mobile';
  if (/front|web|ui(?!x)|client|react|vue|angular|svelte|next/.test(n)) return 'frontend';
  if (/devops|infra|ops|sre|platform|deploy|cloud|k8s|docker/.test(n)) return 'devops';
  if (/qa|test|tester|quality|e2e/.test(n)) return 'qa';
  if (/\bml\b|^ml|ai|data|analyt|science|llm/.test(n)) return 'data';
  if (/design|ux|figma/.test(n)) return 'design';
  if (/doc|writer|content/.test(n)) return 'docs';
  if (/sec|auth|pentest/.test(n)) return 'security';
  if (/back|api|server|db|database|go|rust|java|python|node/.test(n)) return 'backend';
  return 'generic';
}

export const KIND_COLOR = {
  backend: '#3b82c4', frontend: '#b05cc2', devops: '#2f9e64', mobile: '#0ea5e9', qa: '#e8684a',
  data: '#7c4dff', design: '#ec4899', docs: '#a0784a', security: '#d9534f', generic: '#14b8a6',
};
const RUG = {
  manager: '#b9a48a', lounge: '#c99a86', meeting: '#c4b394', garden: '#a9b98f', equipment: '#9aa3ad', training: '#b7c2a0',
  server: '#8f9bb0', accounting: '#b9b08f', lobby: '#8a7f73', restrooms: '#dfe7ec', clinic: '#b9d6d2',
  ceo: '#c4b08f', growth: '#a99bd6', sales: '#b7a3d9', separate: '#9aa3b8', market: '#d9b48f', church: '#d6c49b', personal: '#b8cfb0', library: '#c7b79b', studio: '#c9a3b6', sickbay: '#b9d6d2',
  backend: '#8fa4b8', frontend: '#b29bbd', devops: '#8fae99', mobile: '#8fb7c9', qa: '#c9a08f',
  data: '#a39bc4', design: '#c99bb2', docs: '#b9a68a', security: '#b99393', generic: '#93b8b0',
};
export const KIND_LABEL = {
  backend: 'Backend', frontend: 'Frontend', devops: 'DevOps', mobile: tr('Mobile'), qa: 'QA', data: 'Data / ML',
  design: tr('Design'), docs: tr('Docs'), security: tr('Security'), generic: tr('Team'),
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const SPECIAL = { devops: 'DevOps', ios: 'iOS', ml: 'ML', ai: 'AI', qa: 'QA', ui: 'UI', ux: 'UX', sre: 'SRE', api: 'API', dba: 'DBA' };
export const prettyName = (id) => id.split(/[-_ ]/).map((w) => SPECIAL[w.toLowerCase()] ?? cap(w)).join(' ');

const W = 60;
const H = 34;

// The room kinds the floor has a place for, and what each is called when the owner's plan says nothing.
export const ROOM_KINDS = ['ceo', 'growth', 'sales', 'separate', 'market', 'church', 'personal', 'library', 'studio', 'server'];
const DEFAULT_NAMES = {
  ceo: 'CEO office', growth: 'Growth HQ', sales: 'Sales room', separate: 'Client wing', market: 'Market hall',
  church: 'Ministry wing', personal: 'Personal suite', library: 'Learning library', studio: 'Media studio', server: 'Server room',
};
const DEFAULT_HELPERS = { finance: 'market', coder: 'server', researcher: 'library', writer: 'studio', quick: 'sales' };

/** The owner's plan as the floor uses it: one entry per kind. */
export function planRooms(plan) {
  const out = {};
  for (const k of ROOM_KINDS) out[k] = { kind: k, name: tr(DEFAULT_NAMES[k]) };
  for (const r of plan?.rooms ?? []) if (ROOM_KINDS.includes(r?.kind)) out[r.kind] = { ...out[r.kind], ...r };
  return out;
}

export function buildLayout(team, plan = null) {
  const roles = team.filter((r) => r.id !== 'manager').map((r) => ({ ...r, kind: r.kind || kindOf(r.id), name: r.name || prettyName(r.id) }));
  const P = planRooms(plan);
  const helperRoom = { ...DEFAULT_HELPERS, ...(plan?.helpers ?? {}) };
  const DOOR = [28, 29]; // the front door, in the front wall

  const blocked = Array.from({ length: H }, () => new Array(W).fill(false));
  const wallType = new Map();
  const walls = [];
  const inB = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const block = (x, z) => { if (inB(x, z)) blocked[z][x] = true; };
  const wall = (x, z, type) => {
    if (!inB(x, z)) return;
    const k = z * W + x;
    if (!wallType.has(k)) { walls.push([x, z]); block(x, z); }
    if (wallType.get(k) !== 'outer') wallType.set(k, type);
  };
  const hwall = (z, x0, x1, type, gaps = []) => { for (let x = x0; x <= x1; x++) if (!gaps.includes(x)) wall(x, z, type); };
  const vwall = (x, z0, z1, type, gaps = []) => { for (let z = z0; z <= z1; z++) if (!gaps.includes(z)) wall(x, z, type); };
  const toWorld = ([x, z]) => [x - W / 2 + 0.5, z - H / 2 + 0.5];

  // ---- walls ----
  hwall(0, 0, W - 1, 'outer'); hwall(H - 1, 0, W - 1, 'outer', DOOR);
  vwall(0, 0, H - 1, 'outer'); vwall(W - 1, 0, H - 1, 'outer');
  // top row: CEO office | growth HQ | sales room, glass fronts on the two income rooms
  hwall(9, 1, 11, 'solid', [6, 7]); vwall(12, 1, 9, 'solid');
  hwall(9, 13, 32, 'glass', [22, 23]); vwall(33, 1, 9, 'solid');
  hwall(9, 34, 48, 'glass', [40, 41]);
  // the separate wing: solid all round, no door onto the office floor
  vwall(49, 1, 20, 'solid'); hwall(14, 50, 58, 'solid');
  // sick bay under it, its door onto the bottom corridor
  hwall(20, 50, 58, 'solid', [53, 54]);
  // middle row: market hall | conference room | server room
  hwall(11, 1, 10, 'solid'); vwall(11, 11, 20, 'solid', [15, 16]); hwall(20, 1, 10, 'solid');
  hwall(11, 14, 30, 'glass', [15, 16]); hwall(19, 14, 30, 'glass', [28, 29]); vwall(14, 11, 19, 'solid'); vwall(30, 11, 19, 'solid');
  hwall(11, 32, 48, 'solid', [39, 40]); vwall(32, 11, 20, 'solid'); hwall(20, 32, 48, 'solid'); // its right wall is the separate wing's
  // bottom row: church | personal | lobby (open) | library | studio
  hwall(23, 1, 10, 'solid', [9, 10]); vwall(11, 23, 32, 'solid');
  hwall(23, 12, 19, 'solid'); vwall(20, 23, 32, 'solid', [27, 28]);
  vwall(38, 23, 32, 'solid'); hwall(23, 38, 47, 'glass', [42, 43]); vwall(48, 23, 32, 'solid');
  hwall(23, 49, 58, 'solid', [53, 54]);

  const rooms = [];
  const desks = {};
  const decor = [];
  const plants = [];
  const windows = [];
  const floors = [];
  const lights = [];
  const tables = [];
  const add = (type, cells, extra = {}) => { decor.push({ type, cells, ...extra }); for (const c of cells) block(...c); };
  const soft = (type, cells, extra = {}) => decor.push({ type, cells, ...extra }); // walked onto (a bed someone lies on)
  const plant = (x, z) => { plants.push([x, z]); block(x, z); };
  const room = (kind, x, z, extra = {}) => {
    const p = P[kind];
    const r = { id: kind, kind, name: p ? `${p.name}${p.paused ? ` · ${tr('paused')}` : ''}` : '', x, z, rug: RUG[kind] ?? RUG.generic, ...extra };
    rooms.push(r);
    lights.push({ at: [(x[0] + x[1]) / 2, (z[0] + z[1]) / 2], k: extra.bright ? 13 : 9, d: Math.max(x[1] - x[0], z[1] - z[0]) + 4 });
    return r;
  };
  // desk places, in the order they fill; helpers take them first, the plan's other agents the rest
  const stations = {};
  const station = (kind, x, z) => (stations[kind] ??= []).push({ desk: [x, z], seat: [x, z + 1], room: kind });
  const board = (kind, x, z, w) => decor.push({ type: 'roomBoard', at: [x, z], kind, w });

  // ---- top row ----
  room('ceo', [1, 11], [1, 8]);
  desks.manager = { desk: [6, 4], seat: [6, 5], room: 'ceo' };
  block(6, 4);
  board('ceo', 6, 0, 3.4);
  add('bookshelf', [[1, 1], [2, 1]]); add('bookshelf', [[10, 1], [11, 1]]);
  add('armchairs', [[10, 6], [10, 7]]); add('cafeTable', [[8, 7]]);
  add('globe', [[1, 7]]); add('floorLamp', [[11, 8]]); plant(1, 8);
  windows.push(['top', 3.5], ['top', 8.5], ['left', 4]);

  room('growth', [13, 32], [1, 8], { bright: true });
  board('growth', 22.5, 0, 4.4);
  for (const x of [16, 19, 26, 29]) station('growth', x, 6);
  for (const x of [16, 29]) station('growth', x, 3);
  add('whiteboard', [[13, 3], [13, 4], [13, 5]], { rot: Math.PI / 2 });
  plant(13, 1); plant(32, 1); plant(22, 6); plant(23, 6);
  windows.push(['top', 15.5], ['top', 18.5], ['top', 27], ['top', 30.5]);

  room('sales', [34, 48], [1, 8], { bright: true });
  board('sales', 41.5, 0, 3.6);
  for (const x of [37, 44]) station('sales', x, 6);
  for (const x of [37, 46]) station('sales', x, 3);
  add('standBoard', [[48, 6]], { chart: true }); plant(34, 1); plant(48, 1);
  windows.push(['top', 36.5], ['top', 46.5]);

  room('separate', [50, 58], [1, 13], { rug: RUG.separate });
  board('separate', 54, 0, 3.0);
  for (const [x, z] of [[52, 5], [56, 5], [52, 9], [56, 9]]) station('separate', x, z);
  add('serverRack', [[58, 12], [58, 13]], { rot: -Math.PI / 2 });
  plant(50, 13);
  windows.push(['right', 4], ['right', 10]);

  // ---- middle row ----
  room('market', [1, 10], [12, 19]);
  board('market', 5.5, 11, 3.6);
  station('market', 5, 14);
  decor.push({ type: 'stalls', at: [5.5, 17.4], kind: 'market' });
  for (let x = 1; x <= 10; x++) block(x, 17);
  plant(1, 12); plant(10, 12);
  windows.push(['left', 14], ['left', 17.5]);

  room('meeting', [15, 29], [12, 18]);
  rooms[rooms.length - 1].name = tr('Conference room');
  const meeting = {
    table: { x: [17, 27], z: [14, 15] },
    seats: [17, 19, 21, 23, 25, 27].map((x) => [x, 13]).concat([17, 19, 21, 23, 25, 27].map((x) => [x, 16])),
    screen: { x: 22, z: 11, off: 0.2 },
    view: [22, 17.5],
  };
  for (let x = 17; x <= 27; x++) for (const z of [14, 15]) block(x, z);
  plant(15, 12); plant(29, 12); plant(15, 18);

  room('server', [33, 48], [12, 19]);
  decor.push({ type: 'opsWall', at: [36.3, 11] });
  board('server', 44.2, 11, 3.6);
  for (const x of [40, 36, 44]) station('server', x, 15);
  add('serverRack', [[34, 19], [35, 19]], { rot: Math.PI, alert: true });
  add('serverRack', [[37, 19], [38, 19]], { rot: Math.PI, gpu: true });
  add('ups', [[40, 19]], { rot: Math.PI });
  add('serverRack', [[43, 19], [44, 19]], { rot: Math.PI });
  plant(47, 19); plant(33, 12);

  room('sickbay', [50, 58], [15, 19], { rug: '#b9d6d2' });
  rooms[rooms.length - 1].name = tr('Sick bay · errors');
  decor.push({ type: 'triageBoard', at: [54, 14] });
  soft('bed', [[51, 16], [51, 17]]); soft('bed', [[57, 16], [57, 17]]); soft('bed', [[56, 16], [56, 17]]);
  decor.push({ type: 'medCross', at: [51, 14.2] });
  const clinic = {
    treatment: [{ cell: [51, 18], lie: [51, 16.7], rot: 0 }, { cell: [57, 18], lie: [57, 16.7], rot: 0 }],
    trauma: [{ cell: [56, 18], lie: [56, 16.7], rot: 0 }],
  };
  windows.push(['right', 17]);

  // ---- bottom row ----
  room('church', [1, 10], [24, 32]);
  board('church', 4.5, 23, 3.0);
  for (const z of [27, 30]) for (const x of [2, 5, 8]) add('schoolDesk', [[x, z]]);
  plant(1, 24); plant(10, 32);
  windows.push(['left', 26], ['left', 30], ['bottom', 4], ['bottom', 8]);

  room('personal', [12, 19], [24, 32], { private: true });
  board('personal', 15.5, 23, 3.2);
  add('armchairs', [[13, 28], [13, 29]]); add('cafeTable', [[15, 28]]);
  add('bookshelf', [[18, 32], [19, 32]]); add('floorLamp', [[12, 32]]);
  plant(19, 24); plant(12, 24);
  windows.push(['bottom', 15.5]);

  room('lobby', [21, 37], [23, 32], { rug: null });
  rooms[rooms.length - 1].name = tr('Reception');
  floors.push({ x: [25, 32], z: [28, 31], color: RUG.lobby });
  add('frontDesk', [[25, 25], [26, 25], [27, 25], [28, 25], [29, 25], [30, 25], [31, 25]]);
  add('usageBoard', [[22, 24], [23, 24], [24, 24]]);
  const lounge = {
    couch: { x: [33, 37], z: 32 },
    couchSeats: [[34, 32], [36, 32], [33, 32], [35, 32], [37, 32]],
    coffeeTable: { x: [34, 36], z: 31 },
    beanBags: [[37, 29], [37, 27]],
    coffee: [37, 24],
    coffeeSpot: [36, 25],
    spots: [[33, 29], [35, 29], [22, 29], [24, 30], [23, 27], [34, 27], [22, 31], [33, 27]],
  };
  for (let x = 33; x <= 37; x++) block(x, 32);
  for (let x = 34; x <= 36; x++) block(x, 31);
  lounge.beanBags.forEach((c) => block(...c));
  block(...lounge.coffee);
  plant(21, 32); plant(25, 32); plant(32, 32);
  decor.push({ type: 'entrance' });
  windows.push(['bottom', 23], ['bottom', 34.5]);

  room('library', [39, 47], [24, 32]);
  board('library', 45.4, 23, 2.6);
  station('library', 42, 27); station('library', 45, 27);
  add('bookshelf', [[39, 32], [40, 32]]); add('bookshelf', [[41, 32], [42, 32]]); add('bookshelf', [[44, 32], [45, 32]]); add('bookshelf', [[46, 32], [47, 32]]);
  add('armchairs', [[39, 26], [39, 27]]);
  windows.push(['bottom', 43]);

  room('studio', [49, 58], [24, 32]);
  board('studio', 51, 23, 2.7);
  station('studio', 55, 27); station('studio', 51, 30);
  add('easel', [[50, 27]]); add('floorLamp', [[49, 25]]); add('floorLamp', [[58, 25]]); add('standBoard', [[58, 30]]);
  plant(58, 32);
  windows.push(['right', 27], ['right', 31], ['bottom', 53.5]);

  // ---- who sits where: each helper in the room its plan names, the plan's other agents at the desks left ----
  const used = new Set();
  const take = (kind) => {
    for (const k of [kind, 'growth', 'sales', 'server']) {
      const s = (stations[k] ?? []).find((x) => !used.has(x.desk.join()));
      if (s) { used.add(s.desk.join()); return s; }
    }
    return null;
  };
  for (const r of roles) {
    const s = take(helperRoom[r.id] ?? 'growth');
    if (!s) continue;
    desks[r.id] = { desk: s.desk, seat: s.seat, room: s.room };
    block(...s.desk);
  }
  for (const kind of ['growth', 'sales', 'separate']) {
    for (const label of P[kind]?.agents ?? []) {
      const s = (stations[kind] ?? []).find((x) => !used.has(x.desk.join()));
      if (!s) break;
      used.add(s.desk.join());
      add('agentDesk', [s.desk], { label, paused: !!P[kind].paused });
    }
  }

  const open = { id: 'corridor', kind: 'corridor', name: '', x: [1, W - 2], z: [1, H - 2] };
  rooms.push(open);
  floors.unshift({ x: [1, W - 2], z: [1, H - 2], color: '#f1e3cd' });
  for (const [x, z] of [[6, 10], [22, 10], [40, 10], [12.5, 16], [31, 16], [10, 21.5], [30, 21.5], [50, 21.5]]) lights.push({ at: [x, z], k: 6, d: 10 });

  // ---- wall pieces to draw: straight runs of one kind, then single posts for what is left ----
  const typeAt = (x, z) => (inB(x, z) ? wallType.get(z * W + x) : undefined);
  const covered = new Set();
  const wallSegments = [];
  const scan = (dir) => {
    const A = dir === 'h' ? H : W, B = dir === 'h' ? W : H;
    for (let a = 0; a < A; a++) {
      let s = 0, t;
      for (let b = 0; b <= B; b++) {
        const cur = b < B ? (dir === 'h' ? typeAt(b, a) : typeAt(a, b)) : undefined;
        if (cur === t) continue;
        if (t && b - s >= 2) {
          wallSegments.push({ dir, a: s, b: b - 1, at: a, type: t, outer: t === 'outer' });
          for (let k = s; k < b; k++) covered.add(dir === 'h' ? a * W + k : k * W + a);
        }
        s = b; t = cur;
      }
    }
  };
  scan('h'); scan('v');
  for (const [x, z] of walls) if (!covered.has(z * W + x)) wallSegments.push({ dir: 'h', a: x, b: x, at: z, type: typeAt(x, z), outer: typeAt(x, z) === 'outer' });

  const isFree = (x, z) => inB(x, z) && !blocked[z][x];
  const roomOf = (id) => rooms.find((r) => r.id === id);
  const roomAt = ([x, z]) => rooms.find((r) => r.kind !== 'corridor' && x >= r.x[0] && x <= r.x[1] && z >= r.z[0] && z <= r.z[1]) ?? open;
  const doorX = (DOOR[0] + DOOR[1]) / 2;

  return {
    W, H, cols: 1, toWorld, isFree, walls, wallSegments, rooms, desks, decor, plants, windows, lounge, meeting, tables, floors, lights,
    roomOf, roomAt, entrance: DOOR.map((x) => [x, H - 1]), door: { x: doorX, z: H - 1 }, clinic, plan: P,
    // where visitors from the channels stand, in front of the reception desk
    frontDesk: { spots: [[28, 27], [26, 27], [30, 27], [27, 28], [29, 28], [25, 28], [31, 28]] },
    bossStart: [doorX, H - 4], bossRot: Math.PI, key: `${W}|${rooms.map((r) => `${r.id}:${r.name}`).join('|')}|${Object.keys(desks).join(',')}`,
    // Outside: the way from the front door round to the store on the left, and where to stand there.
    outside: { store: [-10, 14.5], storeSpot: [-5.5, 16], walk: [[doorX, H - 1], [doorX, H + 1.5], [-5.5, H + 1.5]], door: [DOOR[0], H - 2] },
  };
}
