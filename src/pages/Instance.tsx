import {
  lazy,
  Suspense,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useParams,
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { FileChartColumn } from "lucide-react";
import "uplot/dist/uPlot.min.css";
import { InstanceDetails } from "@/components/instance/InstanceDetails";
import { PingChart } from "@/components/instance/PingChart";
import { LoadChart } from "@/components/instance/LoadChart";
import { TrafficChart } from "@/components/instance/TrafficChart";
import {
  buildLoadTimeRangeOptions,
  buildPingTimeRangeOptions,
  buildTrafficTimeRangeOptions,
} from "@/components/instance/chartShared";
import { useAllNodeMeta, useVisibleNodeUuids } from "@/hooks/useNode";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import type { NodeInfo } from "@/types/komari";
import {
  previousEveningInZone,
  resolveRangeInZone,
  type PingTimeRange,
} from "@/utils/pingTimeRange";
import { describeDisplayTimeZone } from "@/utils/timeDisplay";

import {
  instanceViews,
  resolveInstanceView,
  type InstanceView,
} from "@/utils/instanceView";

const CupertinoInstanceHeading = lazy(() => import("@/components/cupertino/CupertinoInstanceHeading"));
const DEFAULT_PING_HOURS = 6;
const NetworkWorkspace = lazy(() =>
  import("@/components/network/NetworkWorkspace").then((m) => ({
    default: m.NetworkWorkspace,
  })),
);

export function Instance() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const { data: config } = usePublicConfig();
  const themeSettings = useThemeSettings();
  const allNodes = useAllNodeMeta();
  const visibleNodeUuids = useVisibleNodeUuids();
  const [localChartType, setChartType] = useState<InstanceView>(() =>
    resolveInstanceView(focus),
  );
  const chartType = localChartType;
  const selectView = (view: InstanceView) => {
    startTransition(() => setChartType(view));
    if (view === "network")
      navigate(`/instance/${uuid}?focus=network`, { replace: true });
    else if (focus === "network")
      navigate(`/instance/${uuid}`, { replace: true });
  };
  const [loadHours, setLoadHours] = useState(0);
  const [pingHours, setPingHours] = useState(DEFAULT_PING_HOURS);
  const [trafficHours, setTrafficHours] = useState(24);
  const [customLoad, setCustomLoad] = useState(false);
  const [customPing, setCustomPing] = useState(false);
  const [customTraffic, setCustomTraffic] = useState(false);
  const [rangeDraft, setRangeDraft] = useState(() =>
    previousEveningInZone(Date.now(), themeSettings.displayTimeZone),
  );
  const [appliedRange, setAppliedRange] = useState<PingTimeRange>(
    () =>
      resolveRangeInZone(
        previousEveningInZone(Date.now(), themeSettings.displayTimeZone),
        themeSettings.displayTimeZone,
      )!,
  );
  const parsedRange = resolveRangeInZone(
    rangeDraft,
    themeSettings.displayTimeZone,
  );
  const customRangeZoneLabel = describeDisplayTimeZone(
    themeSettings.displayTimeZone,
  );

  useEffect(() => {
    const draft = previousEveningInZone(
      Date.now(),
      themeSettings.displayTimeZone,
    );
    const resolved = resolveRangeInZone(draft, themeSettings.displayTimeZone);
    if (!resolved) return;
    setRangeDraft(draft);
    setAppliedRange(resolved);
  }, [themeSettings.displayTimeZone]);
  const chartControlsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!focus) return;
      if (focus === "network") setChartType("network");
      else if (focus === "ping") setChartType("ping");
      else if (["cpu", "ram", "disk"].includes(focus)) setChartType("load");
      else if (focus === "traffic") setChartType("traffic");
    const frame = window.requestAnimationFrame(() => {
      const target =
        document.getElementById(
          focus === "traffic"
            ? "instance-traffic"
            : focus === "expiry"
              ? "instance-expiry"
              : focus === "status"
                ? "instance-summary"
                : "instance-chart-controls",
        ) ?? chartControlsRef.current;
      if (target?.closest("details"))
        target.closest("details")!.open = true;
      if (focus === "expiry" || focus === "status")
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focus, uuid]);

  const nodeOptions = useMemo(() => {
    const nodeByUuid = new Map(allNodes.map((node) => [node.uuid, node]));
    const visibleNodes = visibleNodeUuids
      .map((nodeUuid) => nodeByUuid.get(nodeUuid))
      .filter((node): node is NodeInfo => Boolean(node));
    const currentNode = uuid ? nodeByUuid.get(uuid) : undefined;

    if (
      currentNode &&
      !visibleNodes.some((node) => node.uuid === currentNode.uuid)
    ) {
      return [currentNode, ...visibleNodes];
    }

    return visibleNodes;
  }, [allNodes, uuid, visibleNodeUuids]);
  const loadRanges = useMemo(
    () => buildLoadTimeRangeOptions(config?.record_preserve_time),
    [config?.record_preserve_time],
  );
  const pingRanges = useMemo(
    () => buildPingTimeRangeOptions(config?.ping_record_preserve_time),
    [config?.ping_record_preserve_time],
  );
  const trafficRanges = useMemo(
    () => buildTrafficTimeRangeOptions(config?.record_preserve_time),
    [config?.record_preserve_time],
  );
  const showPingChart = themeSettings.isReady && themeSettings.showPingChart;
  const customRangeActive =
    chartType === "load"
      ? customLoad
      : chartType === "ping"
        ? customPing
        : chartType === "traffic"
          ? customTraffic
          : false;
  const appliedRangeHours =
    (Date.parse(appliedRange.end) - Date.parse(appliedRange.start)) / 3_600_000;

  useEffect(() => {
    if (!loadRanges.some((range) => range.value === loadHours)) {
      setLoadHours(loadRanges[0]?.value ?? 0);
    }
  }, [loadHours, loadRanges]);

  useEffect(() => {
    if (!pingRanges.some((range) => range.value === pingHours)) {
      setPingHours(
        pingRanges.find((range) => range.value === DEFAULT_PING_HOURS)?.value ??
          pingRanges[0]?.value ??
          DEFAULT_PING_HOURS,
      );
    }
  }, [pingHours, pingRanges]);

  useEffect(() => {
    if (!trafficRanges.some((range) => range.value === trafficHours)) {
      setTrafficHours(
        trafficRanges.find((range) => range.value === 24)?.value ??
          trafficRanges[0]?.value ??
          24,
      );
    }
  }, [trafficHours, trafficRanges]);

  useEffect(() => {
    if (themeSettings.isReady && !showPingChart && chartType === "ping") {
      setChartType("load");
    }
  }, [chartType, showPingChart, themeSettings.isReady]);

  if (!uuid) return null;

  const chartControls = (
    <div className="instance-chart-controls">
      {chartType === "load" && (
        <div
          key={`${chartType}-ranges`}
          className="instance-segmented is-scrollable"
        >
          {loadRanges.map((range) => (
            <button
              key={range.value}
              type="button"
              data-active={
                !customLoad && loadHours === range.value ? "true" : "false"
              }
              aria-pressed={!customLoad && loadHours === range.value}
              onClick={() => {
                startTransition(() => {
                  setLoadHours(range.value);
                  setCustomLoad(false);
                });
              }}
            >
              {range.label}
            </button>
          ))}
          <button
            type="button"
            data-active={customLoad ? "true" : "false"}
            aria-pressed={customLoad}
            onClick={() => setCustomLoad(true)}
          >
            自定义
          </button>
        </div>
      )}
      {chartType === "ping" && showPingChart && (
        <div
          key={`${chartType}-ranges`}
          className="instance-segmented is-scrollable"
        >
          {pingRanges.map((range) => (
            <button
              key={range.value}
              type="button"
              data-active={
                !customPing && pingHours === range.value ? "true" : "false"
              }
              aria-pressed={!customPing && pingHours === range.value}
              onClick={() => {
                startTransition(() => {
                  setPingHours(range.value);
                  setCustomPing(false);
                });
              }}
            >
              {range.label}
            </button>
          ))}
          <button
            type="button"
            data-active={customPing ? "true" : "false"}
            aria-pressed={customPing}
            onClick={() => setCustomPing(true)}
          >
            自定义
          </button>
        </div>
      )}
      {chartType === "traffic" && (
        <div
          key={`${chartType}-ranges`}
          className="instance-segmented is-scrollable"
        >
          {trafficRanges.map((range) => (
            <button
              key={range.value}
              type="button"
              data-active={
                !customTraffic && trafficHours === range.value
                  ? "true"
                  : "false"
              }
              aria-pressed={!customTraffic && trafficHours === range.value}
              onClick={() => {
                startTransition(() => {
                  setTrafficHours(range.value);
                  setCustomTraffic(false);
                });
              }}
            >
              {range.label}
            </button>
          ))}
          <button
            type="button"
            data-active={customTraffic ? "true" : "false"}
            aria-pressed={customTraffic}
            onClick={() => setCustomTraffic(true)}
          >
            自定义
          </button>
        </div>
      )}
    </div>
  );
  const chartWorkspace = (
    <section
      ref={chartControlsRef}
      className="instance-panel instance-chart-workspace"
      role="tabpanel"
      id="instance-view-panel"
      aria-labelledby={"instance-view-" + chartType}
    >
      {(chartType === "load" || chartType === "traffic") && (
        <header className="instance-chart-workspace-header">
          <div className="instance-panel-headings">
            <h2 className="instance-panel-title">
              {chartType === "traffic" ? "区间用量" : "性能趋势"}
            </h2>
            <p className="instance-panel-description">
              {instanceViews.find((view) => view.id === chartType)?.description}
            </p>
          </div>
          {chartControls}
        </header>
      )}
      {customRangeActive && (
        <form
          className="surface-inset flex flex-wrap items-end gap-3 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (parsedRange) setAppliedRange(parsedRange);
          }}
        >
          <label className="flex flex-col gap-1 text-xs">
            开始时间（{customRangeZoneLabel}）
            <input
              required
              type="datetime-local"
              className="surface-inset p-2"
              value={rangeDraft.start}
              onChange={(event) =>
                setRangeDraft({ ...rangeDraft, start: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            结束时间（{customRangeZoneLabel}）
            <input
              required
              type="datetime-local"
              className="surface-inset p-2"
              value={rangeDraft.end}
              onChange={(event) =>
                setRangeDraft({ ...rangeDraft, end: event.target.value })
              }
            />
          </label>
          <button
            type="submit"
            className="instance-toggle-button"
            disabled={!parsedRange}
          >
            应用时间范围
          </button>
          {!parsedRange && (
            <span role="alert" className="text-xs">
              请选择有效时间，结束时间须晚于开始时间。
            </span>
          )}
        </form>
      )}
      {chartType !== "network" && (
        <div className="instance-chart-stage">
          <div
            className="instance-chart-view"
            hidden={chartType !== "load"}
            aria-hidden={chartType !== "load"}
          >
            <LoadChart
              uuid={uuid}
              hours={customLoad ? appliedRangeHours : loadHours}
              range={customLoad ? appliedRange : undefined}
              active={chartType === "load"}
            />
          </div>
          <div
            className="instance-chart-view"
            hidden={chartType !== "ping"}
            aria-hidden={chartType !== "ping"}
          >
            {showPingChart ? (
              <PingChart
                uuid={uuid}
                hours={customPing ? appliedRangeHours : pingHours}
                range={customPing ? appliedRange : undefined}
                retentionHours={config?.ping_record_preserve_time}
                active={chartType === "ping"}
              />
            ) : null}
          </div>
          <div
            className="instance-chart-view"
            hidden={chartType !== "traffic"}
            aria-hidden={chartType !== "traffic"}
          >
            <TrafficChart
              uuid={uuid}
              hours={customTraffic ? appliedRangeHours : trafficHours}
              range={customTraffic ? appliedRange : undefined}
              active={chartType === "traffic"}
            />
          </div>
        </div>
      )}
      {chartType === "network" && (
        <Suspense fallback={<p>正在加载网络检测…</p>}>
          <NetworkWorkspace
            key={uuid}
            uuid={uuid}
            name={nodeOptions.find((node) => node.uuid === uuid)?.name || uuid}
          />
        </Suspense>
      )}
    </section>
  );
  const workspaceNavigation = (
        <nav
          className="workspace-instance-navigation workspace-glass"
          aria-label="实例内容导航"
        >
          <div
            className="instance-segmented"
            role="tablist"
            aria-label="实例监控视图"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const available = instanceViews.filter(
                (view) => view.id !== "ping" || showPingChart,
              );
              const current = available.findIndex(
                (view) => view.id === chartType,
              );
              const index =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? available.length - 1
                    : (current +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        available.length) %
                      available.length;
              const next = available[index].id;
              selectView(next);
              requestAnimationFrame(() =>
                document.getElementById("instance-view-" + next)?.focus(),
              );
            }}
          >
            {instanceViews
              .filter((view) => view.id !== "ping" || showPingChart)
              .map((view) => (
                <button
                  key={view.id}
                  id={"instance-view-" + view.id}
                  role="tab"
                  tabIndex={chartType === view.id ? 0 : -1}
                  aria-selected={chartType === view.id}
                  aria-controls="instance-view-panel"
                  data-active={chartType === view.id}
                  onClick={() => selectView(view.id)}
                >
                  {view.label}
                </button>
              ))}
          </div>
          {chartType === "ping" && chartControls}
        </nav>
  );
  return (
    <div
      className="flex flex-col gap-5 py-2 cupertino-instance"
      data-chart={chartType}
    >
      <div className="instance-topbar">
        <Suspense fallback={null}><CupertinoInstanceHeading uuid={uuid} /></Suspense>
        <div className="instance-topbar-actions">
          <Link
            className="instance-report-entry"
            to={`/instance/${encodeURIComponent(uuid)}/report${customRangeActive ? `?${new URLSearchParams({ start: appliedRange.start, end: appliedRange.end })}` : ""}`}
          >
            <FileChartColumn size={14} />
            生成报告
          </Link>
          <button className="cupertino-switch-node" onClick={()=>document.querySelector<HTMLInputElement>('.cupertino-global-search input')?.focus()}>⇆ 切换节点</button>
        </div>
      </div>
      {workspaceNavigation}
      <InstanceDetails uuid={uuid} view={chartType}>
        {chartWorkspace}
      </InstanceDetails>
    </div>
  );
}
