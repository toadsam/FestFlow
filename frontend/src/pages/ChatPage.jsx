import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { askChat } from "../api";
import {
  IconBox,
  IconCalendar,
  IconChat,
  IconClock,
  IconMapPin,
  IconMic,
  IconRefresh,
  IconSearch,
  IconSend,
  IconShield,
  IconUsers,
} from "../components/UxIcons";

const quickActions = [
  {
    label: "지금 추천",
    helper: "공연 · 부스 · 혼잡도",
    question: "지금 기준으로 공연, 부스, 혼잡도를 보고 다음에 뭘 하면 좋을지 추천해줘.",
    icon: IconClock,
    tone: "from-cyan-500/25 to-blue-500/10",
  },
  {
    label: "빠른 식사",
    helper: "대기 짧은 부스",
    question: "지금 대기시간이 짧고 바로 먹기 좋은 부스를 추천해줘.",
    icon: IconBox,
    tone: "from-emerald-400/20 to-cyan-500/10",
  },
  {
    label: "혼잡 회피",
    helper: "사람 적은 곳",
    question: "현재 혼잡도가 낮고 이동하기 편한 곳을 알려줘.",
    icon: IconUsers,
    tone: "from-sky-400/20 to-indigo-500/10",
  },
  {
    label: "분실물",
    helper: "비슷한 물품 찾기",
    question: "분실물을 찾고 싶어. 어떤 정보를 말하면 비슷한 등록 물품을 찾을 수 있어?",
    icon: IconSearch,
    tone: "from-amber-300/20 to-cyan-500/10",
  },
];

const compactActions = [
  {
    label: "다음 공연",
    question: "지금 기준으로 곧 시작하거나 진행 중인 공연을 알려줘.",
    icon: IconCalendar,
  },
  {
    label: "예약 가능",
    question: "지금 예약 가능한 부스가 있는지 알려줘.",
    icon: IconMapPin,
  },
];

const categoryQuestions = [
  { label: "주점", question: "주점 카테고리에서 지금 가기 좋은 부스를 추천해줘." },
  { label: "음식", question: "먹거리나 음식 위주로 지금 가기 좋은 부스를 추천해줘." },
  { label: "포토", question: "사진 찍기 좋은 포토 관련 부스를 추천해줘." },
  { label: "체험", question: "체험형 부스 중 지금 가기 좋은 곳을 추천해줘." },
  { label: "굿즈", question: "굿즈나 상품 관련 부스 중 추천할 만한 곳을 알려줘." },
  { label: "예약", question: "예약 가능한 부스 중 지금 이용하기 좋은 곳을 추천해줘." },
];

const followUpQuestions = [
  "더 가까운 곳",
  "대기 더 짧게",
  "혼잡도 낮은 대안",
];

const promptActions = [...quickActions, ...compactActions];

export default function ChatPage() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "지금 필요한 상황을 선택하거나 바로 질문해 주세요.",
      confidence: "LOW",
      evidence: [],
      warnings: [],
    },
  ]);

  const speechSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    [],
  );

  async function submitQuestion(text) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setLoading(true);

    try {
      const response = await askChat(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: response.answer,
          confidence: response.confidence,
          evidence: response.evidence || [],
          warnings: response.warnings || [],
        },
      ]);
      setQuestion("");
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "응답을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          confidence: "LOW",
          evidence: [],
          warnings: ["네트워크 또는 AI 응답 오류가 발생했습니다."],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function resetMessages() {
    setMessages([
      {
        role: "bot",
        text: "대화를 초기화했습니다. 필요한 상황을 다시 선택해 주세요.",
        confidence: "LOW",
        evidence: [],
        warnings: [],
      },
    ]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitQuestion(question);
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || listening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setQuestion(transcript);
      if (transcript.trim()) {
        submitQuestion(transcript);
      }
    };
    recognition.start();
  }

  const visibleMessages = messages.slice(-12);
  const lastVisibleIndex = visibleMessages.length - 1;

  return (
    <section className="cyber-page min-h-[calc(100vh-5rem)] space-y-3 pb-24 pt-3 scan-enter">
      <header className="rounded-2xl border border-cyan-300/60 bg-slate-950/90 p-3 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.22)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-100/40 bg-cyan-500/20">
              <IconShield className="h-5 w-5 icon-role-ops" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                FestFlow AI
              </p>
              <h2 className="mt-0.5 text-lg font-extrabold leading-tight text-role-ops">
                지금 뭐 할까요?
              </h2>
              <p className="mt-1 text-[11px] font-semibold text-cyan-100/70">
                부스, 공연, 혼잡도, 분실물을 바로 행동으로 연결합니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-100">
              근거 기반
            </span>
            <button
              type="button"
              onClick={resetMessages}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/50 bg-cyan-500/10 text-cyan-100"
              aria-label="대화 초기화"
            >
              <IconRefresh className="h-4 w-4 icon-role-log" />
            </button>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-cyan-300/30 bg-slate-900/70">
          <img
            src="/images/chat-assistant.png"
            alt=""
            className="h-28 w-full object-cover object-[68%_center]"
            loading="eager"
            decoding="async"
          />
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-cyan-300/50 bg-slate-950/90 p-2 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)]"
      >
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-12 flex-1 rounded-xl border border-cyan-400/35 bg-slate-900/90 px-3 text-sm font-semibold text-cyan-50 placeholder:text-cyan-200/50"
            placeholder="예: 지금 빨리 먹을 수 있는 곳"
            aria-label="질문 입력"
          />
          {speechSupported && (
            <button
              type="button"
              onClick={startVoiceInput}
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-cyan-100 ${
                listening
                  ? "border-amber-200/80 bg-amber-500/25"
                  : "border-cyan-300/45 bg-slate-900/90"
              }`}
              aria-label="음성 입력"
              disabled={loading}
            >
              <IconMic className="h-5 w-5" />
            </button>
          )}
          <button
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-200/75 bg-cyan-500/25 text-cyan-50 disabled:opacity-50"
            type="submit"
            disabled={loading || !question.trim()}
            aria-label="전송"
          >
            <IconSend className="h-5 w-5" />
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-cyan-300/35 bg-slate-950/70 p-2">
        <p className="px-1 pb-1 text-[11px] font-bold text-cyan-100/75">
          빠른 선택
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {promptActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-cyan-300/35 bg-cyan-950/45 px-2 text-[11px] font-extrabold text-cyan-100 disabled:opacity-50"
              onClick={() => submitQuestion(action.question)}
              disabled={loading}
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-300/35 bg-slate-950/70 p-2">
        <p className="px-1 pb-1 text-[11px] font-bold text-cyan-100/75">
          카테고리별 바로 조회
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categoryQuestions.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => submitQuestion(item.question)}
              disabled={loading}
              className="min-h-9 shrink-0 rounded-full border border-cyan-300/35 bg-cyan-950/55 px-3 text-xs font-extrabold text-cyan-100 disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <article className="rounded-2xl border border-cyan-300/45 bg-slate-950/80 p-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)]">
        <div className="space-y-3">
          {visibleMessages.map((message, idx) => {
            const isUser = message.role === "user";
            return (
              <MessageBubble
                key={`${message.role}-${idx}`}
                message={message}
                isUser={isUser}
                isLatest={idx === lastVisibleIndex}
                loading={loading}
                onFollowUp={submitQuestion}
                onNavigate={navigate}
              />
            );
          })}

          {loading && <LoadingCard />}
        </div>
      </article>
    </section>
  );
}

function QuickAction({ action, loading, onPick }) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      className={`min-h-[76px] rounded-2xl border border-cyan-300/40 bg-gradient-to-br ${action.tone} p-3 text-left text-cyan-50 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)] transition active:scale-[0.98] disabled:opacity-60`}
      onClick={() => onPick(action.question)}
      disabled={loading}
    >
      <span className="flex items-start gap-2">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/35 bg-slate-950/45">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold leading-5">{action.label}</span>
          <span className="mt-1 block text-[11px] font-semibold leading-4 text-cyan-100/68">
            {action.helper}
          </span>
        </span>
      </span>
    </button>
  );
}

function MessageBubble({ message, isUser, isLatest, loading, onFollowUp, onNavigate }) {
  return (
    <div className={isUser ? "text-right" : "text-left"}>
      <p
        className={`mb-1 inline-flex items-center gap-1 text-[10px] text-cyan-200/70 ${
          isUser ? "" : "text-role-ops"
        }`}
      >
        {isUser ? (
          <>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300" />
            나
          </>
        ) : (
          <>
            <IconChat className="h-3 w-3 icon-role-ops" />
            AI
          </>
        )}
      </p>

      <div
        className={`inline-block max-w-[94%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-cyan-600/85 text-white"
            : "border border-cyan-400/25 bg-slate-900/90 text-cyan-100"
        }`}
      >
        <p className="whitespace-pre-wrap text-left">{message.text}</p>
        {!isUser && (
          <>
            <RecommendationCards evidence={message.evidence} onNavigate={onNavigate} />
            <ChatTrustDetails
              confidence={message.confidence}
              evidence={message.evidence}
              warnings={message.warnings}
              onNavigate={onNavigate}
            />
            {isLatest && !loading && <FollowUps onPick={onFollowUp} />}
          </>
        )}
      </div>
    </div>
  );
}

function RecommendationCards({ evidence = [], onNavigate }) {
  const cards = evidence.slice(0, 3);
  if (cards.length === 0) return null;

  return (
    <div className="mt-3 grid gap-2 border-t border-cyan-400/20 pt-2">
      {cards.map((item, index) => {
        const meta = getEvidenceMeta(item);
        const Icon = meta.icon;
        const reasonParts = splitReason(item.reason);

        return (
          <article
            key={`${item.type}-${item.id}`}
            className="w-full rounded-2xl border border-cyan-300/35 bg-cyan-950/35 p-3 text-left shadow-[0_0_16px_rgba(34,211,238,0.12)]"
          >
            <div className="flex items-start gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/40 bg-slate-950/60">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/60">
                  {index === 0 ? "추천" : meta.label}
                </p>
                <h3 className="mt-0.5 line-clamp-2 text-base font-extrabold leading-snug text-cyan-50">
                  {item.label}
                </h3>
              </div>
            </div>

            {reasonParts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reasonParts.slice(0, 3).map((part) => (
                  <span
                    key={part}
                    className="rounded-full border border-cyan-300/30 bg-slate-950/55 px-2 py-1 text-[10px] font-bold text-cyan-100/85"
                  >
                    {part}
                  </span>
                ))}
              </div>
            )}

            {meta.actions(item).length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {meta.actions(item).map((action) => {
                const ActionIcon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => onNavigate(action.to)}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-cyan-300/40 bg-cyan-500/15 px-2 text-xs font-extrabold text-cyan-50"
                  >
                    <ActionIcon className="h-3.5 w-3.5" />
                    {action.label}
                  </button>
                );
                })}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function getEvidenceMeta(item) {
  if (item?.type === "booth") {
    return {
      label: "부스",
      icon: IconMapPin,
      actions: (evidence) => [
        { label: "지도", to: `/?focusBooth=${evidence.id}`, icon: IconMapPin },
        { label: "상세", to: `/booths/${evidence.id}`, icon: IconSearch },
      ],
    };
  }

  if (item?.type === "event") {
    return {
      label: "공연",
      icon: IconCalendar,
      actions: () => [
        { label: "일정 보기", to: "/events", icon: IconCalendar },
      ],
    };
  }

  if (item?.type === "lost_item") {
    return {
      label: "분실물",
      icon: IconSearch,
      actions: (evidence) => [
        { label: "찾기", to: `/lost-found?query=${encodeURIComponent(evidence.label || "")}`, icon: IconSearch },
      ],
    };
  }

  if (item?.type === "notice") {
    return {
      label: "공지",
      icon: IconShield,
      actions: () => [],
    };
  }

  if (item?.type === "knowledge") {
    return {
      label: "운영 안내",
      icon: IconShield,
      actions: () => [],
    };
  }

  return {
    label: "근거",
    icon: IconShield,
    actions: () => [],
  };
}

function splitReason(reason = "") {
  return reason
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function PrimaryEvidenceActions({ evidence = [], onNavigate }) {
  const primaryActions = buildPrimaryActions(evidence).slice(0, 3);
  if (primaryActions.length === 0) return null;

  return (
    <div className="mt-3 grid gap-2 border-t border-cyan-400/20 pt-2">
      {primaryActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={`${action.label}-${action.to}`}
            type="button"
            onClick={() => onNavigate(action.to)}
            className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-cyan-300/45 bg-cyan-500/15 px-3 text-left text-cyan-50 shadow-[0_0_14px_rgba(34,211,238,0.12)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/35 bg-slate-950/55">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold">{action.label}</span>
                <span className="block truncate text-[11px] font-semibold text-cyan-100/70">
                  {action.caption}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-xs font-black text-cyan-100">보기</span>
          </button>
        );
      })}
    </div>
  );
}

function buildPrimaryActions(evidence = []) {
  const actions = [];
  const seen = new Set();

  for (const item of evidence) {
    for (const action of getEvidenceActions(item)) {
      const key = action.to;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({
        ...action,
        caption: item.label,
        icon: action.icon,
      });
    }
  }
  return actions;
}

function ChatTrustDetails({ confidence, evidence = [], warnings = [], onNavigate }) {
  if (!confidence && evidence.length === 0 && warnings.length === 0) {
    return null;
  }

  const confidenceLabel = {
    HIGH: "높음",
    MEDIUM: "보통",
    LOW: "낮음",
  }[confidence] || confidence;

  return (
    <details className="mt-2 border-t border-cyan-400/20 pt-2 text-left text-[11px] text-cyan-100/80">
      <summary className="cursor-pointer list-none font-semibold text-cyan-100">
        근거 {Math.min(evidence.length, 4)}개 · 신뢰도 {confidenceLabel || "미정"}
      </summary>
      {evidence.length > 0 && (
        <div className="mt-2 space-y-1">
          {evidence.slice(0, 4).map((item) => (
            <div key={`${item.type}-${item.id}`} className="rounded-lg bg-cyan-950/40 px-2 py-1">
              <p>
                <span className="font-semibold">{item.label}</span>
                <span className="text-cyan-100/70"> · {item.reason}</span>
              </p>
              <EvidenceActions evidence={item} onNavigate={onNavigate} />
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-2 space-y-1 text-amber-100">
          {warnings.slice(0, 3).map((warning) => (
            <p key={warning}>주의: {warning}</p>
          ))}
        </div>
      )}
    </details>
  );
}

function EvidenceActions({ evidence, onNavigate }) {
  const actions = getEvidenceActions(evidence);
  if (actions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onNavigate(action.to)}
          className="min-h-7 rounded-full border border-cyan-300/30 bg-slate-900/75 px-2 text-[10px] font-bold text-cyan-100"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function getEvidenceActions(evidence) {
  if (!evidence?.type || evidence.id == null) return [];

  if (evidence.type === "booth") {
    return [
      { label: "지도에서 보기", to: `/?focusBooth=${evidence.id}`, icon: IconMapPin },
      { label: "부스 상세보기", to: `/booths/${evidence.id}`, icon: IconSearch },
      { label: "전체 부스 보기", to: "/", icon: IconBox },
    ];
  }
  if (evidence.type === "lost_item") {
    const query = encodeURIComponent(evidence.label || "");
    return [{ label: "분실물 바로 찾기", to: `/lost-found?query=${query}`, icon: IconSearch }];
  }
  if (evidence.type === "event") {
    return [{ label: "공연 일정 보기", to: "/events", icon: IconCalendar }];
  }
  return [];
}

function FollowUps({ onPick }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-cyan-400/20 pt-2">
      {followUpQuestions.map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(label)}
          className="min-h-8 rounded-full border border-cyan-300/35 bg-cyan-950/50 px-2.5 text-[11px] font-semibold text-cyan-100"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-cyan-400/25 bg-slate-900/90 px-3 py-3 text-sm text-cyan-100">
      <p className="font-extrabold">축제 데이터 확인 중...</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {["근거 검색", "혼잡도 확인", "답변 정리"].map((step) => (
          <span
            key={step}
            className="rounded-lg border border-cyan-300/25 bg-cyan-950/40 px-2 py-1 text-center text-[10px] font-semibold text-cyan-100/75"
          >
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}
