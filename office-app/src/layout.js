// The floor plan: a corporate office drawn from the owner's plan. Left column: sales, accounting, the server room,
// meeting room B and HR. Top row: two team rooms and technical / planning. In the middle the main conference room,
// with the front desk and the customer area between it and the front door. To the right: storage, the customer
// service office, the executive office, the operations center and the restrooms, then the medical wing.
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

const W = 59;
const H = 34;

export function buildLayout(team) {
  const roles = team.filter((r) => r.id !== 'manager').map((r) => ({ ...r, kind: r.kind || kindOf(r.id), name: r.name || prettyName(r.id) }));
  const fin = roles.find((r) => /financ|account|bookkeep|payroll/i.test(r.id));
  const others = roles.filter((r) => r !== fin);
  const DOOR = [17, 18]; // the front door, in the front wall

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

  // outer walls, with the front door left open
  hwall(0, 0, W - 1, 'outer'); hwall(H - 1, 0, W - 1, 'outer', DOOR);
  vwall(0, 0, H - 1, 'outer'); vwall(W - 1, 0, H - 1, 'outer');
  // left column: sales, accounting, server room, meeting room B, HR
  vwall(8, 1, 32, 'solid', [4, 5, 10, 11, 15, 16, 22, 23, 29, 30]);
  for (const z of [7, 13, 18, 27]) hwall(z, 1, 7, 'glass');
  // top row: team rooms A and B, technical / planning
  hwall(7, 11, 36, 'glass', [15, 16, 21, 22, 31, 32]);
  vwall(11, 1, 6, 'solid'); vwall(19, 1, 6, 'solid'); vwall(28, 1, 6, 'solid');
  // the main conference room, an island in the middle
  hwall(9, 11, 25, 'solid'); hwall(18, 11, 25, 'glass', [14, 15, 21, 22]);
  vwall(11, 10, 17, 'solid'); vwall(25, 10, 17, 'solid');
  // storage and the customer service office
  vwall(28, 9, 26, 'solid', [12, 13, 20, 21]);
  vwall(36, 1, 26, 'solid', [19, 20]);
  hwall(9, 29, 35, 'solid'); hwall(17, 29, 35, 'glass'); hwall(26, 29, 35, 'glass');
  // executive office
  hwall(13, 37, 49, 'glass', [38, 39]); vwall(49, 1, 12, 'solid');
  // operations center
  hwall(15, 39, 48, 'solid', [46, 47]); hwall(26, 39, 48, 'glass', [41, 42]);
  vwall(39, 16, 25, 'solid'); vwall(48, 16, 25, 'solid');
  // restrooms
  hwall(28, 28, 49, 'solid', [38, 39]);
  vwall(28, 29, 32, 'solid'); vwall(49, 29, 32, 'solid');
  vwall(35, 29, 32, 'solid', [31]); vwall(43, 29, 32, 'solid', [31]);
  // medical wing
  vwall(51, 1, 32, 'solid', [4, 5, 8, 13, 14, 19, 20, 24, 25, 29, 30]);
  for (const z of [7, 10, 17, 22, 27]) hwall(z, 52, 57, 'glass');

  const rooms = [];
  const desks = {};
  const decor = [];
  const plants = [];
  const windows = [];
  const floors = [];
  const lights = [];
  const tables = [];
  const stations = []; // desks, most wanted first
  const add = (type, cells, extra = {}) => { decor.push({ type, cells, ...extra }); for (const c of cells) block(...c); };
  const plant = (x, z) => { plants.push([x, z]); block(x, z); };
  const room = (id, kind, name, x, z, extra = {}) => { const r = { id, kind, name, x, z, rug: RUG[kind] ?? RUG.generic, ...extra }; rooms.push(r); return r; };
  const light = (x, z, k = 9, d = 11) => lights.push({ at: [x, z], k, d });
  const station = (rank, x, z, roomId) => stations.push({ rank, desk: [x, z], seat: [x, z + 1], room: roomId });
  // decor that people may walk onto (a bed someone lies on)
  const soft = (type, cells, extra = {}) => decor.push({ type, cells, ...extra });
  const tableSet = (x0, x1, seatXs, z0) => {
    for (let x = x0; x <= x1; x++) for (const z of [z0, z0 + 1]) block(x, z);
    return { table: { x: [x0, x1], z: [z0, z0 + 1] }, seats: [...seatXs.map((x) => [x, z0 - 1]), ...seatXs.map((x) => [x, z0 + 2])] };
  };

  // ---- left column ----
  room('sales', 'frontend', tr('Sales & merchandising'), [1, 7], [1, 6]);
  station(6, 4, 3, 'sales');
  add('bookshelf', [[6, 1], [7, 1]]); add('standBoard', [[1, 5]], { chart: true });
  plant(1, 1); plant(7, 6);
  windows.push(['top', 3.5], ['left', 3.5]);

  room(fin ? fin.id : 'accounting', 'accounting', tr('Accounting office'), [1, 7], [8, 12], { role: !!fin });
  const accId = fin ? fin.id : 'spare-acc';
  desks[accId] = { desk: [3, 10], seat: [3, 11], room: accId };
  block(3, 10);
  add('cafeTable', [[6, 11]]);
  add('bookshelf', [[1, 8], [2, 8]]); add('printer', [[7, 8]]);
  windows.push(['left', 10]);

  room('server', 'server', tr('IT / server room'), [1, 7], [14, 17]);
  add('serverRack', [[1, 14], [2, 14]], { alert: true });
  add('serverRack', [[3, 14], [4, 14]], { gpu: true });
  add('ups', [[5, 14]]);
  add('monitorWall', [[6, 14], [7, 14]]);
  windows.push(['left', 16]);

  room('meeting-b', 'meeting', tr('Meeting room B'), [1, 7], [19, 26]);
  tables.push(tableSet(2, 6, [2, 4, 6], 22));
  add('standBoard', [[7, 19]]); plant(1, 19); plant(1, 26);
  windows.push(['left', 21], ['left', 24.5]);

  room('hr', 'design', tr('HR office'), [1, 7], [28, 32]);
  station(7, 4, 30, 'hr');
  add('bookshelf', [[1, 28], [2, 28]]); add('armchairs', [[7, 32]]);
  plant(1, 32);
  windows.push(['left', 30], ['bottom', 4]);

  // ---- top row ----
  room('team-a', 'backend', tr('Team room A'), [12, 18], [1, 6]);
  [[15, 4, 2], [13, 4, 8], [17, 4, 13]].forEach(([x, z, rank]) => station(rank, x, z, 'team-a'));
  add('whiteboard', [[13, 1], [14, 1], [15, 1]]); add('bookshelf', [[17, 1], [18, 1]]);
  room('team-b', 'data', tr('Team room B'), [20, 27], [1, 6]);
  [[24, 4, 3], [21, 4, 9], [26, 4, 14]].forEach(([x, z, rank]) => station(rank, x, z, 'team-b'));
  add('whiteboard', [[21, 1], [22, 1], [23, 1]]); add('bookshelf', [[26, 1], [27, 1]]);
  room('tech', 'devops', tr('Technical / planning'), [29, 35], [1, 6]);
  [[30, 4, 1], [33, 4, 12]].forEach(([x, z, rank]) => station(rank, x, z, 'tech'));
  add('whiteboard', [[29, 1], [30, 1], [31, 1]]);
  add('standBoard', [[35, 3]], { chart: true });
  plant(9, 1); plant(12, 6); plant(20, 6); plant(29, 6);
  windows.push(['top', 13.5], ['top', 16.5], ['top', 22], ['top', 25.5], ['top', 31], ['top', 34]);

  // ---- main conference room ----
  room('meeting', 'meeting', tr('Main conference room'), [12, 24], [10, 17]);
  const meeting = { ...tableSet(13, 23, [13, 15, 17, 19, 21, 23], 13), screen: { x: 18, z: 9 }, view: [18, 16.6] };
  plant(12, 10); plant(24, 10); plant(12, 17); plant(24, 17);
  decor.push({ type: 'usageBoard', at: [18, 18] });

  // ---- lobby: logo, front desk, customer service area ----
  room('lobby', 'lobby', tr('Reception · front desk'), [13, 23], [22, 25], { rug: null });
  decor.push({ type: 'floorLogo', at: [18, 20.6] });
  add('frontDesk', [[15, 24], [16, 24], [17, 24], [18, 24], [19, 24], [20, 24], [21, 24]]);
  plant(13, 23); plant(23, 23);
  room('customers', 'lounge', tr('Customer service area'), [10, 26], [27, 31], { inset: 0.6 });
  add('armchairs', [[11, 28], [11, 30], [13, 31], [25, 28], [25, 30], [23, 31]]);
  add('cafeTable', [[13, 29]]); add('cafeTable', [[23, 29]]);
  plant(9, 32); plant(27, 32); plant(15, 31); plant(21, 31);
  decor.push({ type: 'entrance' });
  windows.push(['bottom', 11], ['bottom', 14], ['bottom', 22], ['bottom', 25]);

  // ---- storage and customer service office ----
  room('storage', 'equipment', tr('Storage · paper & supplies'), [29, 35], [10, 16]);
  add('shelf', [[29, 10], [30, 10]]);
  add('shelf', [[31, 10], [32, 10]], { tools: true });
  add('shelf', [[34, 10], [35, 10]]);
  add('crates', [[35, 12]]); add('crates', [[35, 14]]); add('lockers', [[29, 14], [29, 15]], { rot: Math.PI / 2 });
  for (const x of [31, 33, 35]) add('printer', [[x, 16]]);
  add('memoryBoard', [[31, 13], [32, 13], [33, 13]]);

  room('cs', 'qa', tr('Customer service office'), [29, 35], [18, 25]);
  [[30, 21, 4], [33, 21, 10]].forEach(([x, z, rank]) => station(rank, x, z, 'cs'));
  decor.push({ type: 'inboxBoard', at: [32, 17] });
  add('cafeTable', [[31, 24]]);
  plant(29, 18); plant(35, 25);

  // ---- executive office ----
  room('manager', 'manager', tr('Executive office · Atlas'), [37, 48], [1, 12]);
  desks.manager = { desk: [40, 4], seat: [40, 5], room: 'manager' };
  block(40, 4);
  add('standBoard', [[45, 3]], { chart: true });
  decor.push({ type: 'sign', at: [42.5, 0.1] });
  add('bookshelf', [[37, 1], [38, 1]]); add('bookshelf', [[47, 1], [48, 1]]);
  add('armchairs', [[40, 9], [45, 9]]); add('cafeTable', [[42, 10]]);
  add('globe', [[48, 12]]); add('floorLamp', [[37, 12]]);
  plant(37, 6); plant(48, 6); plant(41, 12); plant(44, 12);
  windows.push(['top', 40.5], ['top', 45]);

  // ---- operations center ----
  room('ops', 'security', tr('Operations center'), [40, 47], [16, 25]);
  decor.push({ type: 'opsWall', at: [43, 15] });
  [[42, 19, 5], [45, 19, 11]].forEach(([x, z, rank]) => station(rank, x, z, 'ops'));
  add('serverRack', [[40, 24], [40, 25]], { rot: Math.PI / 2 });
  plant(40, 16); plant(40, 25); plant(47, 25);

  // ---- restrooms ----
  room('rest-m', 'restrooms', tr("Men's restroom"), [29, 34], [29, 32], { rug: null });
  room('rest-a', 'restrooms', tr('Wash area'), [36, 42], [29, 32], { rug: null });
  room('rest-w', 'restrooms', tr("Women's restroom"), [44, 48], [29, 32], { rug: null });
  floors.push({ x: [29, 48], z: [29, 32], color: '#dfe7ec' });
  for (const x of [30, 32, 34, 44, 46, 48]) add('toilet', [[x, 29]]);
  for (const x of [37, 39, 41]) add('sink', [[x, 32]], { rot: Math.PI });
  windows.push(['bottom', 31.5], ['bottom', 39.5], ['bottom', 46]);

  // ---- medical wing ----
  room('clinic', 'clinic', tr('Medical area'), [52, 57], [1, 6], { rug: '#b9d6d2' });
  add('bed', [[53, 1], [53, 2]]); add('bed', [[55, 1], [55, 2]]);
  add('workbench', [[56, 5], [57, 5]]);
  decor.push({ type: 'medCross', at: [56.5, 0.1] });
  room('janitor', 'equipment', tr('Janitorial storage'), [52, 57], [8, 9], { rug: null });
  add('shelf', [[54, 8], [55, 8]], { tools: true }); add('crates', [[57, 8]]);

  room('lounge', 'lounge', tr('Staff lounge · rest area'), [52, 57], [11, 16]);
  const lounge = {
    couch: { x: [53, 57], z: 16 },
    couchSeats: [[54, 16], [56, 16], [53, 16], [55, 16], [57, 16]],
    coffeeTable: { x: [54, 56], z: 15 },
    beanBags: [[52, 16], [57, 14]],
    coffee: [57, 11],
    coffeeSpot: [56, 12],
    spots: [[53, 13], [55, 13], [54, 14], [56, 14], [53, 14], [55, 14], [56, 13], [54, 13]],
  };
  for (let x = 53; x <= 57; x++) block(x, 16);
  for (let x = 54; x <= 56; x++) block(x, 15);
  lounge.beanBags.forEach((c) => block(...c));
  block(...lounge.coffee);
  add('bed', [[53, 11], [53, 12]]); add('bed', [[55, 11], [55, 12]]);

  room('trauma', 'clinic', tr('Trauma room · critical errors'), [52, 57], [18, 21], { rug: '#b9d6d2' });
  soft('bed', [[53, 18], [53, 19]]); soft('bed', [[55, 18], [55, 19]]); add('workbench', [[57, 20], [57, 21]], { rot: -Math.PI / 2 });
  room('treatment', 'clinic', tr('Treatment room · errors'), [52, 57], [23, 26], { rug: '#b9d6d2' });
  soft('bed', [[53, 23], [53, 24]]); soft('bed', [[55, 23], [55, 24]]); add('sink', [[57, 26]], { rot: -Math.PI / 2 });
  const clinic = {
    treatment: [{ cell: [53, 25], lie: [53, 23.7], rot: 0 }, { cell: [55, 25], lie: [55, 23.7], rot: 0 }],
    trauma: [{ cell: [53, 20], lie: [53, 18.7], rot: 0 }, { cell: [55, 20], lie: [55, 18.7], rot: 0 }],
  };
  room('triage', 'clinic', tr('Triage · error log'), [52, 57], [28, 32], { rug: '#b9d6d2' });
  decor.push({ type: 'triageBoard', at: [54.5, 27] });
  add('reception', [[54, 30], [55, 30]]); add('bench', [[53, 32], [54, 32]]);
  plant(57, 28); plant(57, 32);
  windows.push(['right', 3.5], ['right', 13.5], ['right', 19.5], ['right', 24.5], ['right', 30], ['top', 54]);

  // ---- who sits where: the finance helper in accounting, everyone else by the plan's order of rooms ----
  stations.sort((p, q) => p.rank - q.rank);
  stations.forEach((s, i) => {
    if (!others[i]) return;
    desks[others[i].id] = { desk: s.desk, seat: s.seat, room: s.room };
    block(...s.desk);
  });

  const open = { id: 'corridor', kind: 'corridor', name: '', x: [9, 50], z: [8, 32] };
  rooms.push(open);
  floors.unshift({ x: [1, W - 2], z: [1, H - 2], color: '#f1e3cd' });
  light(4, 5); light(4, 16); light(4, 28); light(15, 4); light(27, 4); light(18, 13.5); light(18, 24, 10, 14); light(32, 17, 9, 13);
  light(42.5, 6, 10, 13); light(43.5, 21); light(39, 30); light(54.5, 5); light(54.5, 15); light(54.5, 27);
  plant(9, 19); plant(27, 19); plant(50, 1); plant(37, 27);

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
    roomOf, roomAt, entrance: DOOR.map((x) => [x, H - 1]), door: { x: doorX, z: H - 1 }, clinic,
    // where visitors from the channels stand, in front of the reception desk
    frontDesk: { spots: [[18, 25], [16, 25], [20, 25], [17, 26], [19, 26], [15, 26], [21, 26]] },
    bossStart: [doorX, H - 4], bossRot: Math.PI, key: `${W}|${rooms.map((r) => r.id).join('|')}`,
    // Outside: the way from the front door round to the store on the left, and where to stand there.
    outside: { store: [-10, 14.5], storeSpot: [-5.5, 16], walk: [[doorX, H - 1], [doorX, H + 1.5], [-5.5, H + 1.5]], door: [DOOR[0], H - 2] },
  };
}
