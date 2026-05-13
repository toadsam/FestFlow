import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  IconBox,
  IconCalendar,
  IconChart,
  IconHome,
  IconMapPin,
  IconSettings,
} from "./components/UxIcons";

const navTabs = [
  { to: "/", label: "홈", icon: IconHome, end: true, match: ["/"] },
  { to: "/stage-map", label: "지도", icon: IconMapPin, match: ["/stage-map"] },
  { to: "/events", label: "공연", icon: IconCalendar, match: ["/events"] },
  { to: "/analytics", label: "혼잡도", icon: IconChart, match: ["/analytics"] },
  {
    to: "/more",
    label: "더보기",
    icon: IconSettings,
    match: ["/more", "/lost-found", "/chat", "/staff"],
  },
];

function isActivePath(pathname, tab) {
  if (tab.end) return pathname === tab.to;
  return tab.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export default function App() {
  const location = useLocation();
  const isOpsRoute = ["/admin", "/ops"].some((path) => location.pathname.startsWith(path));

  return (
    <div className="app-shell festival-shell" data-route-scope={isOpsRoute ? "ops" : "public"}>
      <div className="phone-status-bar" aria-hidden="true">
        <span>9:41</span>
        <span className="phone-status-icons">
          <span />
          <span />
          <span />
        </span>
      </div>

      <main className="festival-main">
        <Outlet />
      </main>

      {!isOpsRoute && (
        <nav className="festival-bottom-nav" aria-label="주요 메뉴">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActivePath(location.pathname, tab);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={`festival-bottom-nav__item ${active ? "festival-bottom-nav__item--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
