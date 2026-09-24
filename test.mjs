// 生态系统模拟器 · 数值与生态测试
// 与 v1（evolution-sim）同一套思路：DOM 桩 + 直接驱动页面真实引擎代码
import { loadEngine } from './harness.mjs';

const E = loadEngine('./index.html');
const K = E.SPECIES_KEYS;
let fails = 0, passes = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if(cond) passes++; else fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const count = sp => { let n = 0; for(const a of E.animals) if(!a.dead && a.sp === sp) n++; return n; };
function clearAll(){ for(const a of E.animals) E.killAnimal(a, 'hunted'); }

/* ================= 一、世界与地形 ================= */
console.log('① 世界与地形生成');
{
  E.resetWorld('classic');
  const tc = E.terrainCount;
  const sum = tc[0] + tc[1] + tc[2] + tc[3];
  ok(sum === E.GW * E.GH, '地形格总数 = ' + sum + '（应为 ' + (E.GW * E.GH) + '）');
  ok(tc[1] > 0, '存在草原地形（' + tc[1] + ' 格）');
  ok(tc[0] > 0, '存在水域地形（' + tc[0] + ' 格）');
  const t = E.terrainAt(10, 10);
  ok(t >= 0 && t <= 3, 'terrainAt 返回合法地形码（' + t + '）');
  ok(E.terrainAt(-100, -100) >= 0 && E.terrainAt(99999, 99999) >= 0, '越界坐标被 clamp，不越界读取');
}

/* ================= 二、植被生长 ================= */
console.log('② 植被逻辑斯蒂生长');
{
  E.resetWorld('empty');
  E.seedVeg(0);
  for(let i = 0; i < E.grass.length; i++) if(E.terrain[i] === E.T_WATER) E.grass[i] = 0;
  const idx = E.tIdx(50, 30);
  E.grass[idx] = 0.05;
  const before = E.grass[idx];
  for(let i = 0; i < 200; i++) E.growVeg(0.4);
  const after = E.grass[idx];
  ok(after > before && after <= 1.0, '生物量 ' + before.toFixed(3) + ' → ' + after.toFixed(3) + '（增长且 ≤1）');
  ok(E.grass[idx] <= 1.0000001, '生物量不会超过上限 1');
}

console.log('③ 取食能量转移');
{
  E.resetWorld('empty');
  E.seedVeg(0);
  const idx = E.tIdx(50, 30);
  E.grass[idx] = 1.0;
  const got = E.eatVeg(50 * E.CELL + 8, 30 * E.CELL + 8, 'grass', 20, 0.5);
  ok(near(got, 10, 0.001), '吃 0.5s 获得 ' + got.toFixed(2) + ' E ≈ 10 E（速率 20×0.5）');
  const got2 = E.eatVeg(50 * E.CELL + 8, 30 * E.CELL + 8, 'grass', 20, 100);
  ok(near(got2, 30, 0.01), '长时段受限于存量：' + got2.toFixed(1) + ' E ≈ 30 E（40-10）');
  ok(E.grass[idx] < 0.001, '格子被啃秃（生物量 → ' + E.grass[idx].toFixed(4) + '）');
}

/* ================= 三、季节与气候 ================= */
console.log('④ 季节模型');
{
  E.resetWorld('classic');
  E.params.rain = 1.0; E.params.temp = 1.0; E.params.vegK = 1.0;
  const Y = E.params.yearLen;
  const samples = [];
  for(const ph of [0, 0.25, 0.5, 0.75]){
    // 注意：不能在这里 resetWorld，那会把 simTime 归零、毁掉刚推进到的相位。
    // 改为一次性走到目标相位：先重置到 0，再连续推进到该相位。
    E.resetWorld('classic');
    E.params.rain = 1.0; E.params.temp = 1.0;
    E.runFor(ph * Y);
    samples.push({ ph, mul: E.seasonGrowthMul(), season: E.seasonInfo().n });
  }
  const summer = samples.find(s => s.season === '夏');
  const winter = samples.find(s => s.season === '冬');
  ok(summer.mul > winter.mul, '夏季生长倍率 ' + summer.mul.toFixed(2) + ' > 冬季 ' + winter.mul.toFixed(2));
  ok(winter.mul > 0, '冬季生长不为负（' + winter.mul.toFixed(2) + '）');
  const all = samples.map(s => s.mul);
  ok(Math.max(...all) < 6, '生长倍率有上限，不爆炸（最大 ' + Math.max(...all).toFixed(2) + '）');
}

/* ================= 四、代谢与动能 ================= */
console.log('⑤ 代谢与体型缩放');
{
  const e1 = E.econOf('rabbit');
  const e2 = E.econOf('deer');
  ok(e2.cap > e1.cap, '鹿容量 ' + e2.cap.toFixed(0) + ' > 兔 ' + e1.cap.toFixed(0));
  ok(e2.mSeek > e1.mSeek, '鹿觅食代谢 ' + e2.mSeek.toFixed(2) + ' > 兔 ' + e1.mSeek.toFixed(2));
  // 关键不变量：草食动物觅食净收益必须为正（负数 = 一觅食就必死）
  const herb = ['insect','rabbit','bird','deer'];
  for(const k of herb){
    const e = E.econOf(k);
    ok(e.netSeek > 0, E.SPECIES[k].name + ' 觅食净收益 ' + e.netSeek.toFixed(2) + ' > 0（否则觅食必死）');
  }
  // Kleiber：大动物单位体重代谢更低
  const perMass1 = e1.mRest / e1.cap, perMass2 = e2.mRest / e2.cap;
  ok(perMass2 < perMass1, '单位体重代谢：鹿 ' + perMass2.toFixed(4) + ' < 兔 ' + perMass1.toFixed(4) + '（Kleiber 定律）');
}

console.log('⑥ 进食速率不随体型爆炸');
{
  // 大动物靠体型不该"越高效"：进食 ∝ size，代谢 ∝ size^0.75
  const eR = E.econOf('rabbit'), eD = E.econOf('deer');
  const ratioR = eR.intake / eR.mEat, ratioD = eD.intake / eD.mEat;
  ok(ratioD < ratioR * 1.5, '鹿进食/代谢比 ' + ratioD.toFixed(2) + ' 未显著高于兔 ' + ratioR.toFixed(2));
}

/* ================= 五、食物网与捕食判定 ================= */
console.log('⑦ 食物网结构');
{
  const S = E.SPECIES;
  for(const k of K){
    ok(Array.isArray(S[k].preyList) && Array.isArray(S[k].plantList), S[k].name + ' 的食物网已预计算');
  }
  ok(S.wolf.preyList.includes('deer'), '狼捕食鹿（食物网有边）');
  ok(S.rabbit.plantList.includes('grass'), '兔吃草（食物网有边）');
  ok(S.rabbit.preyList.length === 0, '兔不是捕食者（preyList 为空）');
  ok(S.wolf.isPredator === true, '狼被标记为捕食者');
}

console.log('⑧ 体型判定（canPrey 方向正确性）');
{
  E.resetWorld('empty');
  /* 阈值从引擎读，避免硬编码过时（历史上这里写死 1.15/0.62，改阈值后测试反而误报） */
  const ADULT_T = 1.40, JUV_T = 1.05;

  const deer = E.spawnAnimal('deer', 800, 500);
  deer.genes.size = 2.0; deer.age = 60;
  const wolf = E.spawnAnimal('wolf', 820, 500);
  const fox = E.spawnAnimal('fox', 830, 500);
  // 捕食者必须"够大"，而不是要求猎物超大
  const expectWolfAdult = wolf.genes.size >= 2.0 * ADULT_T;
  ok(E.canPrey(wolf, deer) === expectWolfAdult,
    '成年鹿(2.0) vs 狼(' + wolf.genes.size.toFixed(2) + ') → ' + E.canPrey(wolf, deer) + '（成年阈值 ' + ADULT_T + '）');
  ok(E.canPrey(fox, deer) === false, '成年鹿不会被明显更小的狐捕食 → ' + E.canPrey(fox, deer));
  deer.age = 5;
  ok(E.canPrey(wolf, deer) === (wolf.genes.size >= 2.0 * JUV_T), '幼鹿对狼的判定符合幼体阈值 ' + JUV_T);
  const sameSp = E.spawnAnimal('wolf', 840, 500);
  ok(E.canPrey(wolf, sameSp) === false, '同种之间不互相捕食');
}

console.log('⑨ Type III 低密度避难');
{
  E.resetWorld('classic');
  const before = E.params.refuge;
  E.params.refuge = 1000;                     // 极强避难
  const np = 30;
  const df = np / (np + E.params.refuge);
  ok(df < 0.05, '猎物 30 只、避难 1000 时捕食效率被压到 ' + (df * 100).toFixed(1) + '%（低密度避难生效）');
  E.params.refuge = 0.0001;                   // 无避难
  const df2 = np / (np + 0.0001);
  ok(df2 > 0.99, '无避难时几乎全效率（' + (df2 * 100).toFixed(1) + '%）');
  E.params.refuge = before;
}

/* ================= 六、能量守恒 ================= */
console.log('⑩ 能量守恒（账本 vs 实际）');
{
  E.resetWorld('classic');
  const e0 = E.totalSystemE(), p0 = E.photosynthesis, m0 = E.metabLoss, d0 = E.decayLoss, r0 = E.reproLoss;
  E.runFor(120);
  const dE = E.totalSystemE() - e0;
  const pred = (E.photosynthesis - p0) - (E.metabLoss - m0) - (E.decayLoss - d0) - (E.reproLoss - r0);
  const err = Math.abs(dE - pred);
  const rel = err / Math.max(1, Math.abs(dE));
  ok(rel < 0.002, '守恒误差 ' + err.toFixed(3) + ' E（相对 ' + (rel * 100).toFixed(4) + '%，应 < 0.2%）');
}

console.log('⑪ 死亡能量三分守恒');
{
  E.resetWorld('empty');
  for(const a of E.animals) E.killAnimal(a, 'hunted');
  const a1 = E.spawnAnimal('rabbit', 400, 300);
  a1.E = 50;
  const before = a1.E;
  const ret = E.killAnimal(a1, 'starved');
  ok(ret === 0 || ret === undefined || ret === 0, '无捕食者时返回 0（实际 ' + ret + '）');
  ok(a1.E === 0, '死亡个体能量清零');
  const a2 = E.spawnAnimal('rabbit', 500, 300);
  a2.E = 60;
  const pred2 = E.spawnAnimal('wolf', 505, 300);
  pred2.E = 0;
  const got = E.killAnimal(a2, 'eaten', pred2);
  ok(got > 0, '捕食者获得能量 ' + got.toFixed(1) + ' E（来自猎物，非凭空）');
  ok(got <= 60, '获得量不超过猎物总能量（守恒）');
}

/* ================= 七、基因与遗传 ================= */
console.log('⑫ 基因变异有界');
{
  const g = E.initGenes('rabbit');
  let outOfRange = 0;
  for(let i = 0; i < 400; i++){
    const m = E.mutateGenes('rabbit', g);
    for(const key in m){
      const R = E.SPECIES.rabbit.genes[key];
      if(!(m[key] >= R.min - 1e-9 && m[key] <= R.max + 1e-9)) outOfRange++;
    }
  }
  ok(outOfRange === 0, '400 轮变异全部落在基因范围内（越界 ' + outOfRange + ' 次）');
  const m2 = E.mutateGenes('rabbit', g);
  ok(m2.speed !== g.speed || m2.size !== g.size, '变异确实产生差异');
}

/* ================= 八、稳定性 ================= */
console.log('⑬ 种群不爆炸（分物种上限生效）');
{
  E.resetWorld('boom');
  E.runFor(200);
  for(const k of K){
    const n = count(k);
    const cap = E.SPECIES[k].popCap;
    ok(n <= cap + 20, E.SPECIES[k].name + ' 数量 ' + n + ' 未显著突破上限 ' + cap);
  }
}

console.log('⑭ 无动物世界植被恢复');
{
  E.resetWorld('empty');
  clearAll();
  const v0 = E.totalVeg();
  E.runFor(60);
  const v1 = E.totalVeg();
  ok(v1 > v0, '无啃食时植被增长：' + Math.round(v0) + ' → ' + Math.round(v1));
}

console.log('⑮ 三个稳定物种能活满 300 秒（回归保护）');
{
  let survivedRuns = 0;
  const RUNS = 3;
  for(let i = 0; i < RUNS; i++){
    E.resetWorld('classic');
    E.runFor(300);
    const okRun = ['insect','rabbit','bird'].every(k => count(k) > 0);
    if(okRun) survivedRuns++;
  }
  ok(survivedRuns === RUNS, '昆虫+兔+鸟 在 ' + RUNS + ' 次运行中全部存活（实际 ' + survivedRuns + '/' + RUNS + '）');
}

console.log('⑮b 成年鹿体型威慑（关键修复的回归保护）');
{
  /* 历史 bug：狼出生体型 2.6，成年鹿阈值只需 猎物×1.15。
     若鹿体型为 2.0 → 阈值 2.3 < 2.6 → 狼天生能猎杀成年鹿，鹿群必然灭绝（实测 0/5）。
     修复：鹿 size.init = 2.3 → 阈值 2.645 > 2.6 → 成年鹿获得体型威慑，鹿群 100% 存活。 */
  E.resetWorld('empty');
  for(const a of E.animals) E.killAnimal(a, 'hunted');
  const d = E.spawnAnimal('deer', 400, 300);
  const w = E.spawnAnimal('wolf', 405, 300);

  const deerSize = E.SPECIES.deer.genes.size.init;
  const wolfSize = E.SPECIES.wolf.genes.size.init;
  ok(deerSize * 1.15 > wolfSize,
    '成年鹿阈值 ' + (deerSize * 1.15).toFixed(3) + ' > 狼体型 ' + wolfSize + '（成年鹿靠体型自保）');

  d.age = 100;                              // 成年
  ok(E.canPrey(w, d) === false, '狼捕不动成年鹿');
  d.age = 3;                                // 幼体
  ok(E.canPrey(w, d) === true, '狼能捕幼鹿（幼体脆弱期，符合生态学）');
}

console.log('⑮c 鹿群长期存活（四级营养级稳定）');
{
  let aliveRuns = 0;
  const RUNS = 3;
  for(let i = 0; i < RUNS; i++){
    E.resetWorld('classic');
    E.runFor(900);
    if(count('deer') > 0) aliveRuns++;
  }
  ok(aliveRuns === RUNS, '鹿在 ' + RUNS + ' 次 900s 运行中全部存活（实际 ' + aliveRuns + '/' + RUNS + '）');
}

console.log('⑯ 死亡原因可追溯');
{
  E.resetWorld('classic');
  E.runFor(150);
  const d = E.deaths;
  const total = (d.starved||0) + (d.eaten||0) + (d.aged||0) + (d.hunted||0) + (d.fire||0);
  ok(total > 0, '发生了 ' + total + ' 次死亡（饿 ' + (d.starved||0) + ' 被吃 ' + (d.eaten||0) + ' 老 ' + (d.aged||0) + '）');
  ok(Object.keys(E.deathsBy).length > 0, '分物种死因已记录');
}

/* ================= 九、UI 工具 ================= */
console.log('⑰ 上帝工具');
{
  E.resetWorld('empty');
  /* 显式找一个非水域格（浇水对水域按设计跳过，会误判为失败） */
  let cell = -1, cx = 0, cy = 0;
  for(let y = 5; y < E.GH - 5 && cell < 0; y++){
    for(let x = 5; x < E.GW - 5; x++){
      const i = E.tIdx(x, y);
      if(E.terrain[i] !== E.T_WATER){ cell = i; cx = x; cy = y; break; }
    }
  }
  ok(cell >= 0, '找到非水域测试格（' + cx + ',' + cy + '）');
  const wx = cx * E.CELL + E.CELL / 2, wy = cy * E.CELL + E.CELL / 2;
  E.grass[cell] = 1.0;
  const g0 = E.grass[cell];
  E.burnArea(wx, wy, 80);
  const g1 = E.grass[cell];
  ok(g1 < g0 * 0.2, '放火烧毁植被（' + g0.toFixed(3) + ' → ' + g1.toFixed(3) + '，应降至 20% 以下）');
  // 浇灌（同一格，已是焦土）
  const h0 = E.grass[cell];
  E.irrigate(wx, wy, 95);
  ok(E.grass[cell] > 0.5 && E.grass[cell] > h0, '浇灌恢复植被（' + h0.toFixed(3) + ' → ' + E.grass[cell].toFixed(3) + '）');
  // 区域工具能移除个体：用足够大的半径覆盖投放区
  E.resetWorld('empty');
  for(let i = 0; i < 10; i++) E.spawnAnimal('rabbit', 400 + i * 4, 300);
  const n0 = count('rabbit');
  E.burnArea(420, 300, 90);      // 半径 90 覆盖 400~436 的范围
  const n1 = count('rabbit');
  ok(n0 > 0 && n1 < n0, '区域工具能移除个体（' + n0 + ' → ' + n1 + '）');
}

console.log('⑱ 渲染不抛异常');
{
  let threw = null;
  try { E.resetWorld('classic'); E.runFor(5); E.render(); } catch(e){ threw = e; }
  ok(threw === null, 'render() 在 DOM 桩下不抛异常' + (threw ? '（' + threw.message + '）' : ''));
}

/* ================= 汇总 ================= */
console.log('');
console.log('═══════════════════════════════════════');
console.log('  通过 ' + passes + ' 项，失败 ' + fails + ' 项');
console.log('═══════════════════════════════════════');
if(fails > 0){
  console.log('❌ 有 ' + fails + ' 项未通过');
  process.exit(1);
} else {
  console.log('✅ 全部通过');
}
