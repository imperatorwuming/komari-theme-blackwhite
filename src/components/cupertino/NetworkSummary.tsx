import { lazy, memo, Suspense, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, MapPin, RefreshCw } from "lucide-react";
import type { useNodeCardModel } from "@/hooks/useNodeCardModel";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { useHomeRoutes, useHomeSpeeds } from "@/hooks/useHomeRoutes";
import { useCardCheck } from "@/hooks/useCardChecks";
import { CardCheckFeedback } from "@/components/node/CardCheckControls";
import { buildHomepagePingCompareUrl, buildHomepagePingSourceRows, type HomepagePingSourceRow } from "@/utils/homepagePingSources";
import { formatDisplayDateTime } from "@/utils/timeDisplay";
import type { PingOverviewSample } from "@/types/komari";
import { routeHeadline } from "@/utils/carrierRoutePresentation";
import type { RouteEvidence } from "@/services/homeRoutes";
import type { HomeSpeedNode, SpeedValue } from "@/services/homeSpeeds";
import { FAMILIES, identifyPingSource, pingSourceFamily, observationFamilies, type Carrier, type Family } from "./networkCardModel";

const RouteDetails = lazy(
  () => import("@/components/node/RouteEvidenceDetails"),
);
const SpeedDetails = lazy(
  () => import("@/components/node/CarrierSpeedDetails"),
);
const CRYSTAL_HISTORY_SEGMENTS = 9;
const sampleLoss = (sample?: PingOverviewSample) => sample?.sampleCount
  ? ((sample.lossCount || 0) / sample.sampleCount) * 100
  : sample?.value === -1 ? 100 : 0;

function crystalHistoryTone(sample: PingOverviewSample | undefined, loss: boolean) {
  if (!sample || !Number.isFinite(sample.value)) return "empty";
  const value = loss ? sampleLoss(sample) : sample.value;
  if (sample.value < 0 || value >= (loss ? 10 : 225)) return "red";
  if (value >= (loss ? 6 : 205)) return "orange";
  if (value >= (loss ? 3 : 150)) return "yellow";
  return value >= (loss ? 1 : 125) ? "lime" : "green";
}

function CrystalQuality({ source, loss = false }: { source: HomepagePingSourceRow; loss?: boolean }) {
  const samples = source.samples.slice(-CRYSTAL_HISTORY_SEGMENTS);
  const value = loss ? source.lossPercent : source.latencyMs;
  const unit = loss ? "%" : "ms";
  return (
    <span className="crystal-quality-metric" title={source.title}>
      <span><b>{value == null ? "--" : value.toFixed(loss ? 1 : 2)}</b>{value != null && <> {unit}</>}</span>
      <span className="crystal-history" aria-hidden="true">
        {Array.from({ length: CRYSTAL_HISTORY_SEGMENTS }, (_, index) => {
          const sample = samples[index - CRYSTAL_HISTORY_SEGMENTS + samples.length];
          return <i key={index} data-tone={crystalHistoryTone(sample, loss)} />;
        })}
      </span>
    </span>
  );
}

function RouteValue({
  value,
  direction,
  carrier,
  timeZone,
  labelMode,
  crystalDirection,
}: {
  value?: RouteEvidence | null;
  direction: string;
  carrier?: Carrier;
  timeZone: string;
  labelMode: "preferred" | "full";
  crystalDirection: "forward" | "return";
}) {
  const [open, setOpen] = useState(false);
  const headline = routeHeadline(value || null, labelMode);
  const Icon = crystalDirection === "return" ? ArrowLeft : ArrowRight;
  return (
    <>
      <button
        type="button"
        className="crystal-route-value"
        data-carrier={carrier}
        data-state={value?.state || "missing"}
        data-direction={crystalDirection}
        data-network={headline}
        aria-label={`${direction} · ${headline}`}
        disabled={!value}
        onClick={() => setOpen(true)}
        title={`${direction} · ${headline} · ${value?.state === "stale" ? "超过 24 小时" : "查看线路证据"}`}
      >
        <span className="crystal-arrow"><Icon aria-hidden="true" /></span>
        <span className="crystal-route-label">{crystalDirection === "forward" ? "去" : "回"} <b>{value ? headline : "--"}</b></span>
      </button>
      {open && (
        <Suspense fallback={<span role="status">正在读取证据…</span>}>
          <RouteDetails
            value={value || null}
            headline={headline}
            direction={direction}
            status={
              value?.state === "stale"
                ? "超过 24 小时"
                : value?.state === "partial"
                  ? "终点未确认"
                  : "观测证据"
            }
            timeZone={timeZone}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}

function Speed({
  value,
  direction,
  onClick,
}: {
  value?: SpeedValue;
  direction: "download" | "upload";
  onClick: () => void;
}) {
  const bits = value?.bitsPerSecond;
  const Icon = direction === "download" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      className="crystal-speed-value"
      data-direction={direction}
      aria-label={`${direction === "download" ? "下行" : "上行"} ${bits == null ? "暂无测速" : `${(bits / 1e6).toFixed(1)} Mbps`}`}
      disabled={bits == null}
      onClick={onClick}
      title={`${direction === "download" ? "下行 · 流入 VPS" : "上行 · 流出 VPS"} · ${value?.state === "partial" ? "部分结果 · " : ""}查看测量详情`}
    >
      <span className="crystal-arrow"><Icon aria-hidden="true" /></span>
      <b>{bits == null ? "--" : (bits / 1e6).toFixed(1)}</b>
    </button>
  );
}

function CheckAction({
  uuid,
  module,
  label,
}: {
  uuid: string;
  module: "routes" | "china-speed";
  label: string;
}) {
  const routes = useHomeRoutes(),
    speeds = useHomeSpeeds();
  const data = module === "routes" ? routes.data : speeds.data;
  const check4 = useCardCheck(uuid, module, "4"),
    check6 = useCardCheck(uuid, module, "6");
  const configured = data?.quickFamilies[uuid] || [];
  if (!data?.quickCheck || !check4.allowed || !configured.length) return null;
  const checks = [check4, check6].filter((_, i) =>
    configured.includes(FAMILIES[i]),
  );
  const busy = checks.some((check) => check.busy);
  return (
    <span className="crystal-check">
      <button
        type="button"
        disabled={busy}
        onClick={() => checks.forEach((check) => check.start())}
        title={`按已有方案检测 ${configured.map((f) => `IPv${f}`).join(" / ")}${module === "china-speed" ? "，会消耗测速流量" : ""}`}
      >
        <RefreshCw className={busy ? "animate-spin" : ""} />
        {busy ? "检测中" : label}
      </button>
      {checks
        .filter((check) => check.entry)
        .map((check, i) => (
          <CardCheckFeedback key={i} check={check} uuid={uuid}>
            {null}
          </CardCheckFeedback>
        ))}
    </span>
  );
}

export const NetworkSummary = memo(function NetworkSummary({
  ping,
  uuid,
  denseView,
  crystalAction,
}: {
  ping: ReturnType<typeof useNodeCardModel>["ping"];
  uuid: string;
  denseView: "standard" | "compact";
  crystalAction?: ReactNode;
}) {
  const settings = useThemeSettings();
  const routes = useHomeRoutes();
  const speeds = useHomeSpeeds();
  const [city, setCity] = useState("北京");
  const [speedDetail, setSpeedDetail] = useState<HomeSpeedNode | null>(null);
  const rows = buildHomepagePingSourceRows(
    ping,
    settings.homepagePingTaskGroups,
    settings.homepagePingTaskOrder[uuid],
  );
  const routeNode =
    routes.data?.display === false ? undefined : routes.data?.nodes[uuid];
  const speedNode =
    speeds.data?.display === false ? undefined : speeds.data?.nodes[uuid];
  const routeFamilies =
    routes.data?.display === false
      ? []
      : observationFamilies(
          routes.data?.configuredFamilies?.[uuid] ??
            (routes.data?.quickCheck
              ? routes.data.quickFamilies[uuid] || []
              : undefined),
          FAMILIES.filter((f) =>
            routeNode?.[f].some((row) => row.forward || row.return),
          ),
        );
  const speedFamilies =
    speeds.data?.display === false
      ? []
      : observationFamilies(
          speeds.data?.configuredFamilies?.[uuid] ??
            (speeds.data?.quickCheck
              ? speeds.data.quickFamilies[uuid] || []
              : undefined),
          FAMILIES.filter((f) => speedNode?.[f] != null),
        );
  const routesVisible = routeFamilies.length > 0;
  const speedsVisible = speedFamilies.length > 0;
  const cities = [
    ...new Set(
      speedFamilies.flatMap(
        (f) => speedNode?.[f]?.cities.map((c) => c.city) || [],
      ),
    ),
  ];
  const selectedCity = cities.includes(city as "北京")
    ? city
    : cities[0] || "北京";
  const routeTimes = routeFamilies
    .flatMap(
      (f) =>
        routeNode?.[f]
          .flatMap((r) => [r.forward?.at, r.return?.at])
          .filter((t): t is string => Boolean(t)) || [],
    )
    .sort();
  const speedTimes = speedFamilies
    .flatMap((f) => (speedNode?.[f]?.at ? [speedNode[f]!.at] : []))
    .sort();
  const time = (at?: string) =>
    at
      ? formatDisplayDateTime(Date.parse(at), settings.displayTimeZone, {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
      : "暂无检测";
  const cityPicker = (
    <label className="crystal-city">
      <MapPin />
      <select
        aria-label="测速地区"
        value={selectedCity}
        disabled={!cities.length}
        onChange={(e) => setCity(e.target.value)}
      >
        {(cities.length ? cities : ["北京"]).map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  );
  const routePair = (carrier: Carrier | undefined, family: Family, taskName?: string) => {
    const row = carrier && routeFamilies.includes(family)
      ? routeNode?.[family].find((row) => row.carrier === carrier)
      : undefined;
    const title = carrier ? `${carrier} IPv${family}` : taskName;
    return (
      <div className="crystal-route-pair">
        <RouteValue
          value={row?.forward}
          direction={`${title} 去程（大陆 → VPS）`}
          carrier={carrier}
          timeZone={settings.displayTimeZone}
          labelMode={routes.data?.labelMode || "preferred"}
          crystalDirection="forward"
        />
        <RouteValue
          value={row?.return}
          direction={`${title} 回程（VPS → 大陆）`}
          carrier={carrier}
          timeZone={settings.displayTimeZone}
          labelMode={routes.data?.labelMode || "preferred"}
          crystalDirection="return"
        />
      </div>
    );
  };
  const speedPair = (carrier: Carrier | undefined, family: Family) => {
    const snapshot = carrier && speedFamilies.includes(family) ? speedNode?.[family] : undefined,
      row = snapshot?.cities
        .find((c) => c.city === selectedCity)
        ?.rows.find((r) => r.carrier === carrier);
    return (
      <div
        className="crystal-speed-pair"
        data-stale={snapshot?.stale}
        title={snapshot?.stale ? "测速结果超过有效期" : undefined}
      >
        <Speed
          value={row?.download}
          direction="download"
          onClick={() => setSpeedDetail(snapshot || null)}
        />
        <Speed
          value={row?.upload}
          direction="upload"
          onClick={() => setSpeedDetail(snapshot || null)}
        />
      </div>
    );
  };
  // Ping summaries can outlive a binding change until the next poll.
  const crystalRows = rows.flatMap(source => {
    if (!settings.homepagePingBindings[String(source.taskId)]?.includes(uuid)) return [];
    const identity = identifyPingSource(source);
    const carrier = identity?.carrier;
    const family = identity?.family ?? pingSourceFamily(source);
    if (!settings.showPingChart && (!carrier || (!routeFamilies.includes(family) && !speedFamilies.includes(family)))) return [];
    return [{ carrier, family, source }];
  });
  const crystalColumns = [
    "minmax(0, 20fr)",
    routes.data?.display !== false && "minmax(0, 21fr)",
    settings.showPingChart && "minmax(0, 38fr)",
    speeds.data?.display !== false && "minmax(0, 19fr)",
  ].filter(Boolean).join(" ");
  return (
    <section
      className="crystal-network"
      aria-label="三网网络表现"
      style={{ "--crystal-network-columns": crystalColumns } as CSSProperties}
    >
      {crystalRows.map(({ carrier, family, source }) => {
        const name = source.name || `任务 #${source.taskId}`;
        return (
          <div className="crystal-network-row" key={source.taskId} data-family={family} data-carrier={carrier}>
            <strong className="crystal-network-name" title={name}>{name}</strong>
            {routes.data?.display !== false && routePair(carrier, family, name)}
            {settings.showPingChart && (
              <Link className="crystal-quality" to={buildHomepagePingCompareUrl(uuid, [source.taskId])}
                aria-label={`${name} 质量历史 · 延迟 ${source.latencyLabel} · ${source.name.endsWith(" TCPing") ? "TCP 连接失败率" : "丢包"} ${source.lossLabel}`}>
                <CrystalQuality source={source} />
                <CrystalQuality source={source} loss />
              </Link>
            )}
            {speeds.data?.display !== false && speedPair(carrier, family)}
          </div>
        );
      })}
      {(routesVisible || speedsVisible || crystalAction) && (
        <footer className="crystal-network-controls">
          {denseView === "standard" && routesVisible && <span>最近检测 {time(routeTimes.at(-1))}</span>}
          {denseView === "standard" && speedsVisible && <span>最近测速 {time(speedTimes.at(-1))} · P1 单连接</span>}
          <div className="crystal-network-actions">
            {speedsVisible && (cities.length > 1 || denseView === "standard") && cityPicker}
            {routesVisible && <CheckAction uuid={uuid} module="routes" label="检测线路" />}
            {speedsVisible && <CheckAction uuid={uuid} module="china-speed" label="测速" />}
            {crystalAction}
          </div>
        </footer>
      )}
      {(routes.isError || (!routes.data?.available && !routes.isPending)) && (
        <p className="crystal-network-empty">
          {routes.isError
            ? "线路摘要读取失败，可稍后重试。"
            : "暂无线路观测；可在工作室配置网络观测。"}
        </p>
      )}
      {speedDetail && (
        <Suspense fallback={<p role="status">正在读取测速详情…</p>}>
          <SpeedDetails
            uuid={uuid}
            node={speedDetail}
            city={selectedCity}
            timeZone={settings.displayTimeZone}
            admin={speeds.data?.access === "admin"}
            onClose={() => setSpeedDetail(null)}
          />
        </Suspense>
      )}
    </section>
  );
});
