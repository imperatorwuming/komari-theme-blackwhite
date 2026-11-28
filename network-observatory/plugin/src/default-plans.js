const { ENDPOINTS } = require("./report-catalog.js");
const { normalizeSuite } = require("./report-model.js");

const FAMILIES = ["4", "6"];
const CITIES = ["北京", "上海", "广州"];
const ROUTE_ASNS = new Set(["4134", "4837", "9808"]);
const SPEED_MIB = 32;
const IDS = {
  routes: { "4": "85105cee-9fe6-5da0-8114-c88273090041", "6": "85105cee-9fe6-5da0-8114-c88273090061" },
  speed: { "4": "85105cee-9fe6-5da0-8114-c88273090042", "6": "85105cee-9fe6-5da0-8114-c88273090062" },
  ip: { "4": "85105cee-9fe6-5da0-8114-c88273090043", "6": "85105cee-9fe6-5da0-8114-c88273090063" },
};
const routes = ENDPOINTS.filter(endpoint => endpoint.category === "china-route" &&
  CITIES.includes(endpoint.city) && ROUTE_ASNS.has(endpoint.id.split("_").at(-1)));
const speedTargets = ENDPOINTS.filter(endpoint => endpoint.method === "taier" && CITIES.includes(endpoint.city));
const pingTargets = routes.map(({ address, city, carrierId, family, port }, index) => ({
  family,
  name: `Blackwhite · ${city} ${{ telecom: "电信", unicom: "联通", mobile: "移动" }[carrierId]} IPv${family} TCPing`,
  target: `${address}:${port}`,
  type: "tcp",
  // Stagger the time between samples across provider targets.
  interval: 180 + index * 7,
  default_on: false,
}));

function weekly(day, time) {
  return { type: "rules", rules: [{ type: "weekly", weekdays: [day], time, timezone: "Asia/Shanghai" }] };
}

function describe() {
  return { speedMiBPerFamily: speedTargets.length * SPEED_MIB };
}

function validateSelection(input) {
  const families = input?.families;
  if (!Array.isArray(families) || !families.length || families.length > 2 ||
      new Set(families).size !== families.length || families.some(family => !FAMILIES.includes(family)) ||
      !Array.isArray(input.speedFamilies) || input.speedFamilies.length > 2 ||
      new Set(input.speedFamilies).size !== input.speedFamilies.length ||
      input.speedFamilies.some(family => !families.includes(family)) || typeof input.runNow !== "boolean")
    throw new Error("默认检测只能选择已验证的 IPv4、IPv6、测速和首轮开关");
  return { families: FAMILIES.filter(family => families.includes(family)), speedFamilies: input.speedFamilies, runNow: input.runNow };
}

function planDefinitions(selection) {
  const light = [], speed = [];
  for (const family of selection.families) {
    light.push({
      id: IDS.routes[family],
      name: `大陆线路-v${family}（默认）`,
      modules: [{
        module: "routes", family, endpoints: routes.filter(endpoint => endpoint.family === family).map(endpoint => endpoint.id),
        protocols: ["tcp"], publicSources: true, timing: { type: "interval", minutes: 360 },
      }],
    }, {
      id: IDS.ip[family],
      name: `IP 质量与流媒体／AI 解锁-v${family}（默认）`,
      modules: ["ip-quality", "media-unlock"].map(module => ({
        module, family, timing: weekly(4, "00:00"),
      })),
    });
    if (selection.speedFamilies.includes(family)) speed.push({
      id: IDS.speed[family],
      name: `测速-v${family}（默认）`,
      trafficAccepted: true,
      modules: [{
        module: "china-speed", preset: "china-public", family, endpoints: speedTargets.map(endpoint => endpoint.id),
        seconds: 5, warmupSeconds: 0, streams: [1], maxTrafficMiB: SPEED_MIB, splitSpeedBudget: true, timing: weekly(3, "22:00"),
      }],
    });
  }
  return [...light, ...speed];
}

function enroll(s, uuid, selection) {
  s.defaultEnrollments ||= {};
  if (s.defaultEnrollments[uuid]) return false;
  const definitions = planDefinitions(selection);
  const existing = new Map(s.reportSuites.map(suite => [suite.id, suite]));
  if (s.reportSuites.length + definitions.filter(plan => !existing.has(plan.id)).length > 100)
    throw new Error("报告方案已达容量上限，无法加入默认检测");
  if (definitions.some(plan => existing.get(plan.id)?.clients.length >= 2000 &&
      !existing.get(plan.id).clients.includes(uuid)))
    throw new Error("默认方案的 VPS 已达上限");
  for (const plan of definitions.filter(value => value.trafficAccepted)) {
    const configured = existing.get(plan.id)?.modules;
    const expected = plan.modules[0];
    if (configured && (configured.length !== 1 || configured[0].family !== expected.family ||
        configured[0].module !== expected.module || configured[0].maxTrafficMiB > SPEED_MIB ||
        !configured[0].splitSpeedBudget || configured[0].endpoints.some(id => !expected.endpoints.includes(id)) ||
        configured[0].sources.length || configured[0].streams.length !== 1 ||
        JSON.stringify(configured[0].timing) !== JSON.stringify(expected.timing)))
      throw new Error("站点默认测速方案已自定义，请由管理员确认流量及排程后手工加入");
  }
  for (const plan of definitions) {
    const suite = existing.get(plan.id);
    if (suite) {
      if (!suite.clients.includes(uuid)) suite.clients.push(uuid);
    } else {
      s.reportSuites.push(normalizeSuite({ ...plan, clients: [uuid] }, s.reportResources));
    }
  }
  s.defaultEnrollments[uuid] = {
    families: selection.families, pingPending: true,
    firstPlans: selection.runNow ? definitions.map(plan => plan.id) : [],
  };
  s.revision++;
  return true;
}

async function syncPings(call, enrollments) {
  const raw = await call("admin:getAllPingTasks");
  const tasks = Array.isArray(raw) ? raw : raw?.data;
  if (!Array.isArray(tasks)) throw new Error("Komari 原生 Ping 任务格式不兼容");
  const edits = [], bindings = {};
  for (const { family, ...target } of pingTargets) {
    const clients = Object.keys(enrollments).filter(uuid => enrollments[uuid].families.includes(family));
    if (!clients.length) continue;
    const existing = tasks.find(task => task.name === target.name);
    if (existing && (existing.target !== target.target || existing.type !== target.type ||
        existing.default_on !== false || !Array.isArray(existing.clients))) continue;
    const missing = clients.filter(uuid => !existing?.clients.includes(uuid));
    let id = existing?.id;
    if (!existing) {
      id = (await call("admin:addPingTask", { ...target, clients })).task_id;
    } else if (missing.length) {
      edits.push({ ...existing, clients: [...existing.clients, ...missing] });
    }
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Komari 未返回可用的 Ping 任务编号");
    bindings[id] = clients;
  }
  if (edits.length) await call("admin:editPingTask", { tasks: edits });
  return bindings;
}

module.exports = { describe, validateSelection, enroll, syncPings };
