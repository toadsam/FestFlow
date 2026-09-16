import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  IconBox,
  IconMapPin,
  IconSettings,
  IconUsers,
} from "./components/UxIcons";
import { IconBeer, IconFlag, IconHeartSaju } from "./components/v2/V2Kit";

/*
 * 이번 축제(바람)에서 여는 탭은 네 개뿐이다.
 * 지도·공연·혼잡도·채팅·스태프 등은 지우지 않고 탭에서만 뺐다. 주소로 치면 그대로 열린다.
 */
const navTabs = [
  { to: "/", label: "축제", icon: IconFlag, end: true, match: ["/", "/home-v1", "/events", "/stage-map", "/analytics"] },
  { to: "/booths", label: "주점", icon: IconBeer, match: ["/booths"] },
  { to: "/ai-match", label: "사주 소개팅", icon: IconHeartSaju, match: ["/ai-match"] },
  { to: "/lost-found", label: "분실물", icon: IconBox, match: ["/lost-found"] },
];

const opsTabs = [
  { to: "/ops/master", label: "운영", icon: IconSettings, match: ["/ops/master"] },
  { to: "/admin/simulation", label: "시뮬", icon: IconUsers, match: ["/admin/simulation", "/ops/simulation"] },
  { to: null, label: "부스", icon: IconBox, match: ["/ops/booth"] },
  { to: "/stage-map", label: "지도", icon: IconMapPin, match: ["/stage-map"] },
  { to: "/more", label: "더보기", icon: IconSettings, match: ["/more"] },
];

function isActivePath(pathname, tab) {
  if (tab.end && pathname === tab.to) return true;
  return tab.match.some((path) => path !== "/" && (pathname === path || pathname.startsWith(`${path}/`)));
}

export default function App() {
  const location = useLocation();
  const isOpsRoute = ["/admin", "/ops"].some((path) => location.pathname.startsWith(path));
  // 자리 현황판은 스태프가 한 손으로 쓰는 전체 화면이라 운영 탭도 손님 탭도 붙이지 않는다.
  const isTableBoardRoute = /^\/ops\/booth\/[^/]+\/tables$/.test(location.pathname);
  const isOpsPanelRoute =
    !isTableBoardRoute && (location.pathname.startsWith("/ops") || location.pathname.startsWith("/admin/simulation"));
  // 테이블 QR 주문 흐름은 하단 탭 없이 전체 화면으로 쓴다.
  const isOrderRoute = location.pathname.startsWith("/order/") || location.pathname.startsWith("/orders/");
  const isV2Shell = !isOpsPanelRoute && !isOrderRoute;
  const showCustomerNav = isV2Shell && !isTableBoardRoute;

  return (
    <div
      className="app-shell festival-shell"
      data-route-scope={isOpsRoute ? "ops" : "public"}
      data-order-route={isOrderRoute ? "true" : undefined}
      data-v2={isV2Shell ? "true" : undefined}
    >
      <main className="festival-main">
        <Outlet />
      </main>

      {showCustomerNav && (
        <nav className="v2-nav" aria-label="주요 메뉴">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActivePath(location.pathname, tab);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={`v2-nav__item ${active ? "v2-nav__item--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}

      {isOpsPanelRoute && (
        <nav className="festival-bottom-nav ops-bottom-nav" aria-label="운영 메뉴">
          {opsTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActivePath(location.pathname, tab);
            const target = tab.to || location.pathname;
            return (
              <NavLink
                key={tab.label}
                to={target}
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
