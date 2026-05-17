import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconBox,
  IconChat,
  IconMapPin,
  IconSettings,
  IconShield,
  IconUsers,
} from "../components/UxIcons";

const menuItems = [
  { to: "/ai-match", label: "AI 프로필 매칭", icon: IconUsers, caption: "사진 등록, AI 카드, 데이트 신청" },
  { to: "/lost-found", label: "분실물 센터", icon: IconBox, caption: "보관 물품 검색과 내 물건 표시" },
  { to: "/chat", label: "AI 챗봇", icon: IconChat, caption: "공연, 부스, 혼잡도 빠른 답변" },
  { to: "/staff", label: "운영진 문의", icon: IconUsers, caption: "현장 문의와 스태프 연결" },
  { to: "/stage-map", label: "위치 설정", icon: IconMapPin, caption: "내 주변 정보 갱신" },
  { to: "/admin", label: "관리자 페이지", icon: IconShield, caption: "관리자 전용 진입" },
];

export default function MorePage() {
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem("festflow_high_contrast") === "true");
  const [notifications, setNotifications] = useState(() => localStorage.getItem("festflow_notifications") !== "false");
  const [language, setLanguage] = useState(() => localStorage.getItem("festflow_language") || "한국어");

  useEffect(() => {
    localStorage.setItem("festflow_high_contrast", String(highContrast));
    document.documentElement.dataset.contrast = highContrast ? "high" : "normal";
  }, [highContrast]);

  useEffect(() => {
    localStorage.setItem("festflow_notifications", String(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem("festflow_language", language);
  }, [language]);

  return (
    <section className="uni-page more-page">
      <header className="more-hero">
        <div>
          <strong>FestFlow</strong>
          <p>아주대 축제를 더 편하게 즐기는 앱</p>
        </div>
        <IconSettings className="h-6 w-6" />
      </header>

      <section className="more-account-card">
        <span />
        <div>
          <strong>로그인 없이 이용하세요</strong>
          <small>예약 인증은 부스 상세에서 휴대폰 번호로 진행됩니다.</small>
        </div>
      </section>

      <section className="more-menu-card">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={`${item.to}-${item.label}`} to={item.to} className="more-menu-row">
              <span>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.caption}</small>
              </div>
              <em>›</em>
            </Link>
          );
        })}
      </section>

      <section className="more-menu-card settings-card">
        <label className="settings-row">
          <span>알림 설정</span>
          <input
            type="checkbox"
            checked={notifications}
            onChange={(event) => setNotifications(event.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>고대비 모드</span>
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(event) => setHighContrast(event.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>언어</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option>한국어</option>
            <option>English</option>
          </select>
        </label>
      </section>

      <button type="button" className="logout-row">
        <IconShield className="h-4 w-4" />
        앱 정보 v1.0.0
      </button>
    </section>
  );
}
