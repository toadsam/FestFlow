function IconBase({ className = "h-4 w-4", children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconChat(props) {
  return (
    <IconBase {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" />
    </IconBase>
  );
}

export function IconRefresh(props) {
  return (
    <IconBase {...props}>
      <path d="M20 5v5h-5" />
      <path d="M4 19v-5h5" />
      <path d="M6.2 10a7 7 0 0 1 11.7-2.5L20 10" />
      <path d="M17.8 14a7 7 0 0 1-11.7 2.5L4 14" />
    </IconBase>
  );
}

export function IconChart(props) {
  return (
    <IconBase {...props}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <rect x="7" y="11" width="3" height="7" rx="1" />
      <rect x="12" y="8" width="3" height="10" rx="1" />
      <rect x="17" y="5" width="3" height="13" rx="1" />
    </IconBase>
  );
}

export function IconTrophy(props) {
  return (
    <IconBase {...props}>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H6a2 2 0 0 0 2 3" />
      <path d="M16 6h2a2 2 0 0 1-2 3" />
      <path d="M12 11v5" />
      <path d="M9 20h6" />
    </IconBase>
  );
}

export function IconFlame(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3c2 2.4 4 4.1 4 7a4 4 0 1 1-8 0c0-2.3 1.1-3.7 4-7Z" />
      <path d="M12 13c1 .8 2 1.8 2 3a2 2 0 1 1-4 0c0-1 .6-1.9 2-3Z" />
    </IconBase>
  );
}

export function IconMapPin(props) {
  return (
    <IconBase {...props}>
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.4" />
    </IconBase>
  );
}

export function IconUsers(props) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="2.5" />
      <circle cx="16.5" cy="9.5" r="2" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
      <path d="M14 18a3.5 3.5 0 0 1 6 0" />
    </IconBase>
  );
}

export function IconClock(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.8 1.8" />
    </IconBase>
  );
}

export function IconSearch(props) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4-4" />
    </IconBase>
  );
}

export function IconBox(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3 4 7l8 4 8-4-8-4Z" />
      <path d="M4 7v9l8 5 8-5V7" />
      <path d="M12 11v10" />
    </IconBase>
  );
}

export function IconCalendar(props) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 9h16" />
    </IconBase>
  );
}

export function IconArrowLeft(props) {
  return (
    <IconBase {...props}>
      <path d="M18 12H6" />
      <path d="m11 7-5 5 5 5" />
    </IconBase>
  );
}

export function IconMusic(props) {
  return (
    <IconBase {...props}>
      <path d="M16 5v10.2a2.8 2.8 0 1 1-1.8-2.6V7.1L9 8.2v8a2.8 2.8 0 1 1-1.8-2.6V6.8L16 5Z" />
    </IconBase>
  );
}

export function IconDownload(props) {
  return (
    <IconBase {...props}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </IconBase>
  );
}

export function IconShield(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3 5 6v5c0 4.2 2.5 7.6 7 10 4.5-2.4 7-5.8 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.2-3.2" />
    </IconBase>
  );
}

export function IconSettings(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="2.7" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.8 7.8 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1c-.6.2-1.2.6-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1c.6.4 1.2.8 1.8 1l.3 3.1h4.8l.3-3.1c.6-.2 1.2-.6 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
    </IconBase>
  );
}

export function IconAlert(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="16.8" r=".8" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconClipboard(props) {
  return (
    <IconBase {...props}>
      <rect x="6" y="5" width="12" height="15" rx="2" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M9 11h6" />
      <path d="M9 14h6" />
    </IconBase>
  );
}

export function IconMic(props) {
  return (
    <IconBase {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </IconBase>
  );
}

export function IconSend(props) {
  return (
    <IconBase {...props}>
      <path d="M21 3 10 14" />
      <path d="m21 3-7 18-4-7-7-4 18-7Z" />
    </IconBase>
  );
}
