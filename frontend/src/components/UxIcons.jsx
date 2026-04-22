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
