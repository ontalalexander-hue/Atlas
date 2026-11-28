// The floor plan. One fixed plan, drawn like a commercial office: meeting rooms across the back, private offices down
// the left, an open floor of desk pods in the middle, reception at the front door, and on the right the restrooms,
// phone booths, equipment room and the breakout kitchen. Each helper gets a pod; a finance helper gets the accounting
// office. A bigger team adds pod columns, and the building grows to the right.
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
  server: '#8f9bb0', accounting: '#b9b08f', lobby: '#8a7f73',
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

const H = 32;
const POD_PITCH = 8;

export function buildLayout(team) {
  const roles = team.filter((r) => r.id !== 'manager').map((r) => ({ ...r, kind: r.kind || kindOf(r.id), name: r.name || prettyName(r.id) }));
  const fin = roles.find((r) => /financ|account|bookkeep|payroll/i.test(r.id));
  const podRoles = roles.filter((r) => r !== fin);
  const cols = Math.max(4, Math.ceil(podRoles.length / 2));
  const S = (cols - 4) * POD_PITCH; // how far the right-hand block moves when the floor grows
  const R = (x) => x + S;
  const W = 44 + S;
  const DOOR = [19, 20]; // the front door, in the front wall

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
  // back band: three meeting rooms behind a glass front
  hwall(7, 1, W - 2, 'glass', [14, 15, 24, 25, 36, 37]);
  vwall(19, 1, 6, 'solid'); vwall(31, 1, 6, 'solid');
  // left column: private offices behind a glass front, and the training room at the front corner
  vwall(10, 8, 25, 'glass', [10, 11, 16, 17, 23, 24]);
  hwall(13, 1, 9, 'solid'); hwall(20, 1, 9, 'solid'); hwall(26, 1, 14, 'solid');
  vwall(14, 27, 30, 'glass', [28, 29]);
  // the wall behind the reception desk
  hwall(22, 16, 23, 'solid');
  // right block: restrooms, equipment room, phone booths
  vwall(R(25), 19, 27, 'solid');
  hwall(19, R(25), R(32), 'solid', [R(30)]);
  hwall(19, R(33), W - 2, 'glass', [R(36), R(37)]);
  vwall(R(32), 19, 25, 'solid');
  hwall(25, R(25), W - 2, 'solid');
  vwall(R(28), 26, 27, 'solid'); vwall(R(31), 26, 27, 'solid');

  const rooms = [];
  const desks = {};
  const decor = [];
  const plants = [];
  const windows = [];
  const floors = [];
  const lights = [];
  const tables = [];
  const add = (type, cells, extra = {}) => { decor.push({ type, cells, ...extra }); for (const c of cells) block(...c); };
  const plant = (x, z) => { plants.push([x, z]); block(x, z); };
  const room = (id, kind, name, x, z, extra = {}) => {
    const r = { id, kind, name, x, z, rug: RUG[kind] ?? RUG.generic, ...extra };
    rooms.push(r);
    if (extra.light !== false) lights.push({ at: [(x[0] + x[1]) / 2, (z[0] + z[1]) / 2], k: 9 });
    return r;
  };
  const tableSet = (x0, x1, seatXs) => {
    for (let x = x0; x <= x1; x++) for (const z of [3, 4]) block(x, z);
    return { table: { x: [x0, x1], z: [3, 4] }, seats: [...seatXs.map((x) => [x, 2]), ...seatXs.map((x) => [x, 5])] };
  };

  // ---- meeting rooms ----
  room('meeting', 'meeting', tr('Conference room A'), [1, 18], [1, 6]);
  const meeting = { ...tableSet(4, 16, [5, 7, 9, 11, 13, 15]), screen: { x: 10, z: 0, off: 0.2 }, view: [10, 6] };
  plant(1, 1); plant(18, 1); plant(1, 6);
  room('meeting-b', 'meeting', tr('Meeting room B'), [20, 30], [1, 6]);
  tables.push(tableSet(23, 27, [23, 25, 27]));
  add('standBoard', [[29, 5]]); plant(20, 1);
  room('meeting-c', 'meeting', tr('Meeting room C'), [32, W - 2], [1, 6]);
  const cMid = Math.round((32 + W - 2) / 2);
  tables.push(tableSet(cMid - 3, cMid + 3, [cMid - 3, cMid - 1, cMid + 1, cMid + 3]));
  add('standBoard', [[33, 5]], { chart: true }); plant(W - 2, 1);
  windows.push(['top', 4], ['top', 16], ['top', 22.5], ['top', 27.5], ['top', cMid - 2.5], ['top', cMid + 2.5]);

  // ---- left column ----
  room('server', 'server', tr('Server room'), [1, 9], [8, 12]);
  add('serverRack', [[2, 8], [3, 8]], { alert: true });
  add('serverRack', [[4, 8], [5, 8]], { gpu: true });
  add('ups', [[6, 8]]);
  add('monitorWall', [[7, 8], [8, 8]]);
  add('crates', [[1, 12]]);
  windows.push(['left', 10]);

  room('manager', 'manager', tr('Atlas · CEO office'), [1, 9], [14, 19]);
  desks.manager = { desk: [5, 16], seat: [5, 17], room: 'manager' };
  block(5, 16);
  add('bookshelf', [[7, 14], [8, 14]]);
  add('armchairs', [[1, 17], [1, 18]]);
  add('globe', [[8, 19]]);
  add('floorLamp', [[1, 19]]);
  plant(1, 14); plant(9, 14);
  windows.push(['left', 15.5], ['left', 17.5]);

  room(fin ? fin.id : 'accounting', 'accounting', fin ? `${fin.name} · ${tr('Accounting')}` : tr('Accounting'), [1, 9], [21, 25], { role: !!fin });
  const accId = fin ? fin.id : 'spare-acc';
  desks[accId] = { desk: [3, 23], seat: [3, 24], room: accId };
  desks[`${accId}#2`] = { desk: [6, 23], seat: [6, 24], room: accId };
  block(3, 23); block(6, 23);
  add('bookshelf', [[1, 21], [2, 21]]);
  add('printer', [[8, 21]]);
  plant(1, 25);
  windows.push(['left', 23]);

  room('training', 'training', tr('Training room'), [1, 13], [27, 30]);
  add('whiteboard', [[2, 27], [3, 27], [4, 27]]);
  for (const x of [2, 5, 8, 11]) add('schoolDesk', [[x, 29]]);
  decor.push({ type: 'clock', at: [9, 26.05] });
  plant(13, 27);
  windows.push(['left', 28.5], ['bottom', 4], ['bottom', 8], ['bottom', 12]);

  // ---- the open floor: pods of four desks, two facing two ----
  const podX = Array.from({ length: cols }, (_, c) => 13 + c * POD_PITCH);
  const podZ = [{ flip: 10, front: 11 }, { flip: 15, front: 16 }];
  const order = [];
  for (let c = 0; c < cols; c++) order.push([1, c], [0, c]);
  order.sort((p, q) => ((p[0] + p[1]) % 2) - ((q[0] + q[1]) % 2) || p[1] - q[1]); // a checkerboard first, so the team spreads out
  order.forEach(([row, c], i) => {
    const r = podRoles[i];
    const id = r ? r.id : `spare-${i}`;
    const x = podX[c], z = podZ[row];
    desks[id] = { desk: [x, z.front], seat: [x, z.front + 1], room: id };
    desks[`${id}#2`] = { desk: [x + 2, z.front], seat: [x + 2, z.front + 1], room: id };
    desks[`${id}#3`] = { desk: [x, z.flip], seat: [x, z.flip - 1], room: id, rot: Math.PI };
    desks[`${id}#4`] = { desk: [x + 2, z.flip], seat: [x + 2, z.flip - 1], room: id, rot: Math.PI };
    for (let dx = 0; dx <= 2; dx++) { block(x + dx, z.flip); block(x + dx, z.front); }
    room(id, r ? r.kind : 'generic', r ? r.name : '', [x - 1, x + 3], [z.flip - 1, z.front + 1], { role: !!r, pod: true, inset: 0, rug: r ? RUG[r.kind] ?? RUG.generic : null, light: false });
  });
  const open = { id: 'corridor', kind: 'corridor', name: '', x: [11, W - 2], z: [8, 18] };
  rooms.push(open);
  const CARPET = '#9299a2';
  floors.push({ x: [11, W - 2], z: [8, 18], color: CARPET }, { x: [11, R(24)], z: [19, 21], color: CARPET }, { x: [11, 14], z: [22, 25], color: CARPET });
  for (let x = 16; x < W - 4; x += 12) lights.push({ at: [x, 13], k: 7 });
  decor.push({ type: 'usageBoard', at: [19, 7] });
  plant(11, 8); plant(W - 2, 8); plant(W - 2, 18); plant(11, 25);
  windows.push(['right', 10], ['right', 13], ['right', 16]);

  // ---- reception and lobby ----
  room('lobby', 'lobby', tr('Reception'), [15, R(24)], [23, 30], { rug: null });
  floors.push({ x: [17, 22], z: [26, 29], color: RUG.lobby });
  add('reception', [[19, 24], [20, 24]]);
  decor.push({ type: 'sign', at: [19.5, 22.05] });
  add('bench', [[16, 30], [17, 30]]);
  add('bench', [[22, 30], [23, 30]]);
  add('waterCooler', [[15, 23]]);
  plant(15, 30); plant(24, 30); plant(16, 23); plant(23, 23);
  decor.push({ type: 'entrance' });
  windows.push(['bottom', 16.5], ['bottom', 22.5]);

  // ---- right block ----
  room('restrooms', 'restrooms', tr('Restrooms'), [R(26), R(31)], [20, 24], { rug: null });
  floors.push({ x: [R(26), R(31)], z: [20, 24], color: '#dfe7ec' });
  add('toilet', [[R(26), 21]], { rot: Math.PI / 2 });
  add('toilet', [[R(26), 23]], { rot: Math.PI / 2 });
  add('sink', [[R(31), 21]], { rot: -Math.PI / 2 });
  add('sink', [[R(31), 23]], { rot: -Math.PI / 2 });
  decor.push({ type: 'stall', at: [R(26.75), 22] });

  room('equipment', 'equipment', tr('Equipment room'), [R(33), W - 2], [20, 24]);
  add('printer', [[R(33), 20]]);
  add('shelf', [[R(39), 20], [R(40), 20]]);
  add('shelf', [[R(41), 20], [R(42), 20]], { tools: true });
  add('lockers', [[R(42), 22], [R(42), 23]], { rot: -Math.PI / 2 });
  add('workbench', [[R(36), 23], [R(37), 23]]);
  add('crates', [[R(33), 24]]);
  windows.push(['right', 22]);

  for (const [x, color] of [[26, '#2f6fb5'], [29, '#d9703a']]) {
    add('phoneBooth', [[R(x), 26], [R(x + 1), 26]], { color });
  }
  rooms.push({ id: 'booths', kind: 'booths', name: tr('Phone booths'), x: [R(26), R(30)], z: [26, 27], rug: null });

  room('lounge', 'lounge', tr('Breakout & kitchen'), [R(32), W - 2], [26, 30]);
  const lounge = {
    couch: { x: [R(34), R(38)], z: 30 },
    couchSeats: [[R(35), 30], [R(37), 30], [R(34), 30], [R(36), 30], [R(38), 30]],
    coffeeTable: { x: [R(35), R(37)], z: 29 },
    beanBags: [[R(32), 30], [R(40), 30]],
    coffee: [R(41), 26],
    coffeeSpot: [R(41), 27],
    spots: [[R(33), 28], [R(35), 28], [R(38), 28], [R(40), 28], [R(28), 28], [R(31), 28], [R(39), 27], [R(36), 27]],
  };
  for (let x = R(34); x <= R(38); x++) block(x, 30);
  for (let x = R(35); x <= R(37); x++) block(x, 29);
  lounge.beanBags.forEach((c) => block(...c));
  block(...lounge.coffee);
  add('arcade', [[R(32), 26]]);
  add('vending', [[R(33), 26]]);
  add('kitchenCounter', [[R(36), 26], [R(37), 26], [R(38), 26], [R(39), 26], [R(40), 26]]);
  add('fridge', [[R(42), 26]]);
  add('cafeTable', [[R(27), 30]]);
  add('cafeTable', [[R(30), 30]]);
  plant(R(42), 30); plant(R(25), 29);
  windows.push(['right', 28.5], ['bottom', R(28.5)], ['bottom', R(41)]);

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
    W, H, cols, toWorld, isFree, walls, wallSegments, rooms, desks, decor, plants, windows, lounge, meeting, tables, floors, lights,
    roomOf, roomAt, entrance: DOOR.map((x) => [x, H - 1]), door: { x: doorX, z: H - 1 },
    bossStart: [doorX, H - 4], bossRot: Math.PI, key: `${W}|${rooms.map((r) => r.id).join('|')}`,
    // Outside: the way from the front door round to the store on the left, and where to stand there.
    outside: { store: [-10, 14.5], storeSpot: [-5.5, 16], walk: [[doorX, H - 1], [doorX, H + 1.5], [-5.5, H + 1.5]], door: [DOOR[0], H - 2] },
  };
}
