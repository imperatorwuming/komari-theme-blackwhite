import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarClock,
  ChevronDown,
  LayoutGrid,
  Menu,
  Search,
  Server,
  Settings,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAllNodeMeta, useHomeNodeSummaries } from "@/hooks/useNode";
import { NodeSwitcher } from "@/components/instance/NodeSwitcher";
import { notifyPaletteChanged } from "@/utils/palette";
import "@/styles/cupertino.css";
import "@/styles/crystal-workspace.css";

export default function CupertinoShell() {
  const location = useLocation(),
    navigate = useNavigate();
  const { data: me } = useAuth();
  const allNodes = useAllNodeMeta(),
    summaries = useHomeNodeSummaries();
  const nodes = useMemo(
    () => allNodes.filter((n) => me?.logged_in || !n.hidden),
    [allNodes, me?.logged_in],
  );
  const visible = summaries.filter((n) => me?.logged_in || !n.hidden);
  const current = location.pathname.match(/^\/instance\/([^/]+)/)?.[1];
  const uuid = current || nodes[0]?.uuid;
  const instance = current != null,
    home =
      location.pathname === "/" &&
      !location.search.includes("view=theme-manage");
  const params = new URLSearchParams(location.search),
    ping = params.get("focus") === "ping" || params.get("focus") === "network";
  const [open, setOpen] = useState(false);
  const search = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    document.documentElement.dataset.cupertinoPage = home
      ? "home"
      : instance
        ? "instance"
        : "utility";
    notifyPaletteChanged();
    return () => {
      delete document.documentElement.dataset.cupertinoPage;
    };
  }, [home, instance]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (
        !home &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        search.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [home]);
  const instanceUrl = uuid ? `/instance/${encodeURIComponent(uuid)}` : "/";
  const links = [
    {
      label: "节点总览",
      icon: LayoutGrid,
      to: "/",
      active: home && !params.get("status") && !params.get("region"),
    },
    {
      label: "服务器",
      icon: Server,
      to: instanceUrl,
      active: instance && !ping && !location.pathname.endsWith("/report"),
    },
    {
      label: "网络监控",
      icon: Activity,
      to: uuid ? instanceUrl + "?focus=ping" : "/compare",
      active: instance && ping,
    },
    {
      label: "计划任务",
      icon: CalendarClock,
      to: me?.logged_in
        ? "/?view=theme-manage&section=network&panel=plans"
        : instanceUrl + "/report",
      active: params.get("panel") === "plans",
    },
    {
      label: "告警通知",
      icon: Bell,
      to: "/?status=attention",
      active: params.get("status") === "attention",
    },
    {
      label: "数据统计",
      icon: BarChart3,
      to: "/compare",
      active: location.pathname === "/compare",
    },
    {
      label: "设置中心",
      icon: Settings,
      to: me?.logged_in ? "/?view=theme-manage" : "/admin",
      active: params.get("view") === "theme-manage" && !params.get("panel"),
    },
  ];
  const navigation = (
    <nav aria-label="晶透导航">
      {links.map(({ label, icon: Icon, to, active }) => (
        <Link
          key={label}
          to={to}
          onClick={() => setOpen(false)}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={20} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
  const account = (
    <>
      <span className="cupertino-avatar">
        {(me?.username || "K").slice(0, 1).toUpperCase()}
      </span>
      <span>
        <strong>{me?.username || "访客"}</strong>
        <small>{me?.logged_in ? "管理员" : "公开监控"}</small>
      </span>
      <ChevronDown size={13} />
    </>
  );
  return (
    <>
      {open && (
        <button
          className="cupertino-drawer-backdrop"
          aria-label="关闭导航"
          onClick={() => setOpen(false)}
        />
      )}
      <header className="cupertino-masthead">
        <button
          className="cupertino-mobile-menu"
          aria-label={open ? "关闭导航" : "打开导航"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        {open && <div className="cupertino-top-navigation">{navigation}</div>}
        {!home && (
          <div className="cupertino-global-search" ref={search}>
            <Search size={18} />
            <NodeSwitcher
              nodes={nodes}
              currentUuid={current || ""}
              showCurrentValue={false}
              placeholder="搜索名称、IP、标签…"
              onSelect={(next) =>
                navigate(
                  "/instance/" +
                    encodeURIComponent(next) +
                    (instance && !location.pathname.endsWith("/report")
                      ? location.search
                      : ""),
                )
              }
            />
            <kbd>⌘K</kbd>
          </div>
        )}
        <div className="cupertino-header-actions">
          <Link
            to="/?status=attention"
            aria-label="查看关注节点"
            className="cupertino-notifications"
          >
            <Bell size={21} />
            {visible.some((n) => n.online === false) && <i />}
          </Link>
          <details className="cupertino-account cupertino-header-account">
            <summary>{account}</summary>
            <AccountMenu loggedIn={me?.logged_in === true} />
          </details>
        </div>
      </header>
    </>
  );
}
function AccountMenu({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="cupertino-account-menu">
      {loggedIn ? (
        <Link to="/?view=theme-manage">Blackwhite 工作室</Link>
      ) : (
        <a href="/admin">后台登录</a>
      )}
      <button
        onClick={() =>
          document
            .querySelector<HTMLButtonElement>(".floating-controls-trigger")
            ?.click()
        }
      >
        主题与视图设置
      </button>
    </div>
  );
}
