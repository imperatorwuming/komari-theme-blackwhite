async function runControllerScenario() {
  const originalAssets = await require("./src/report-assets.js").createReportAssets({fetcher:async url=>({ok:true,text:async()=>JSON.stringify(url.endsWith("/ipinfo")?{ip:"192.0.2.1",ts:1793836800000}:{success:true,data:{result:"UEsDBA=="}})})}).collect("https://nodequality.com/r/runtime", "nodequality-full");
  if (originalAssets.nodeArchive !== "UEsDBA==") throw Error("Runtime NodeQuality original archive fetch failed");
  var scheduleModel = require("./src/native-model.js");
  var schedule = scheduleModel.timing({type:"rules",rules:[{type:"interval",minutes:120,anchor:Date.parse("2026-10-28T00:00:00Z")},{type:"every-days",days:2,startDate:"2026-10-28",time:"09:00",timezone:"Asia/Shanghai"},{type:"weekly",weekdays:[1,5],time:"21:00",timezone:"Asia/Shanghai"}]},"nodequality-full");
  if (scheduleModel.next(schedule, Date.parse("2026-10-28T00:00:00Z")) !== Date.parse("2026-10-28T01:00:00Z") || scheduleModel.next(schedule, Date.parse("2026-10-28T01:00:00Z")) !== Date.parse("2026-10-28T02:00:00Z")) throw new Error("Runtime combined schedule calculation failed");
  var A = "c388e74d-a922-4ae1-bd10-1fb30e2e53de",
    token = "a".repeat(64),
    routes = new Map(), pings = [];
  var ctx = {
    server: {
      route: (method, url, handler) => routes.set(method + " " + url, handler),
      call: async (method, params) => {
        if (method === "admin:listClients") return [{ uuid: A, name: "runtime test", ipv4: "8.8.8.8" }];
        if (method === "admin:getAllPingTasks") return pings;
        if (method === "admin:addPingTask") {
          var id = pings.length + 1;
          pings.push({ ...params, id });
          return { task_id: id };
        }
        throw new Error("Unexpected runtime RPC " + method);
      },
    },
    storageDir: __storageDir__,
    isMissingFile,
    respond: (res, status, body) => Object.assign(res, { status, body }),
    authorized: () => true,
    readBody: (req) => JSON.parse(req.body),
    readState: () => ({
      tasks: [],
      nodes: {
        [A]: {
          tokenHash: require("crypto")
            .createHash("sha256")
            .update(token)
            .digest("hex"),
        },
      },
    }),
  };
  async function invoke(method, url, body = {}) {
    var route = [...routes.keys()].find((key) => {
      var [m, p] = key.split(" ");
      return (
        m === method &&
        new RegExp("^" + p.replace(/:[^/]+/g, "[^/]+") + "$").test(url)
      );
    });
    if (!route) throw new Error("Runtime route missing: " + url);
    var res = {};
    await routes.get(route)(
      {
        url,
        headers: { authorization: "Bearer " + token },
        body: JSON.stringify(body),
      },
      res,
    );
    if (res.status >= 400) throw new Error(JSON.stringify(res));
    return res.body;
  }
  var native = require("./src/native-controller.js").registerNativeController(
    ctx,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  var v2 = "/api/blackwhite-network-observatory/v2",
    v3 = "/api/blackwhite-network-observatory/v3";
  await invoke("POST", v2 + "/workers/node/" + A + "/heartbeat", {
    version: "runtime test",
    tools: ["curl"],
    features: ["report-v3", "latency-samples"],
  });
  var first = await invoke("POST", v3 + "/suites", {
    clients: [A],
    revision: 0,
    modules: [{ module: "international", endpoints: ["aws:ap-east-1"] }],
  });
  var second = await invoke("POST", v3 + "/suites", {
    clients: [A],
    revision: 1,
    modules: [{ module: "international", endpoints: ["aws:ap-east-1"] }],
  });
  await invoke("POST", v3 + "/suites/" + first.suite.id + "/run");
  await invoke("POST", v3 + "/suites/" + second.suite.id + "/run");
  if (native.read().jobs.filter((j) => j.phase === "shared").length !== 1)
    throw new Error("Runtime shared queue mismatch");
  var state = native.read();
  state.jobs = [];
  require("./src/native-queue-state.js").writeNativeState(
    require("path").join(__storageDir__, "native-state.json"), state, isMissingFile,
  );
  var restarted =
    require("./src/native-controller.js").registerNativeController(ctx);
  await new Promise((resolve) => setTimeout(resolve, 30));
  if (
    restarted.read().jobs.length !== 2 ||
    restarted.read().jobs.filter((j) => j.phase === "shared").length !== 1
  )
    throw new Error("Runtime restart recovery mismatch");
  var bgp = await invoke("POST", v3 + "/suites", {
    clients: [A],
    revision: 2,
    modules: [{ module: "bgp" }],
  });
  await invoke("POST", v3 + "/suites/" + bgp.suite.id + "/run");
  await restarted.tick();
  var rounds = restarted.roundController.store.list(A, "bgp").rounds;
  if (rounds.length !== 1 || rounds[0].state !== "complete")
    throw new Error(
      "Runtime BGP scheduler did not complete: " + JSON.stringify(rounds),
    );
  console.log(
    "Official Komari runtime: report routes, shared recovery and async BGP scheduler passed",
  );
  var setup = await invoke("POST", v2 + "/workers/node/" + A + "/default-plans", {
    families: ["4", "6"], speedFamilies: ["6"], runNow: false,
  });
  await restarted.roundController.syncDefaultPings();
  var home = await invoke("GET", v3 + "/home-routes");
  if (!setup.enrolled || pings.length !== 18 || Object.keys(home.pingBindings).length !== 18)
    throw new Error("Runtime default enrollment did not finish");
  console.log("Official Komari runtime: dual-stack defaults and native TCPing enrollment passed");
  return true;
}
