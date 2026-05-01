import { useMemo, useState } from "react";
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

const followUpQuestions = [
  "더 가까운 곳",
  "대기 더 짧게",
  "혼잡도 낮은 대안",
];

export default function ChatPage() {
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
                현장 AI 도우미
              </h2>
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

      <div className="grid grid-cols-2 gap-2">
        {quickActions.map((action) => (
          <QuickAction key={action.label} action={action} loading={loading} onPick={submitQuestion} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {compactActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-slate-950/70 px-3 text-sm font-extrabold text-cyan-100 disabled:opacity-50"
              onClick={() => submitQuestion(action.question)}
              disabled={loading}
            >
              <Icon className="h-4 w-4" />
              {action.label}
            </button>
          );
        })}
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

function MessageBubble({ message, isUser, isLatest, loading, onFollowUp }) {
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
            <ChatTrustDetails
              confidence={message.confidence}
              evidence={message.evidence}
              warnings={message.warnings}
            />
            {isLatest && !loading && <FollowUps onPick={onFollowUp} />}
          </>
        )}
      </div>
    </div>
  );
}

function ChatTrustDetails({ confidence, evidence = [], warnings = [] }) {
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
            <p key={`${item.type}-${item.id}`} className="rounded-lg bg-cyan-950/40 px-2 py-1">
              <span className="font-semibold">{item.label}</span>
              <span className="text-cyan-100/70"> · {item.reason}</span>
            </p>
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
