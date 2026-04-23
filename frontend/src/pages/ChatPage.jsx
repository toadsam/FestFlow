import { useState } from "react";
import { askChat } from "../api";
import { IconChat, IconRefresh } from "../components/UxIcons";

const quickQuestions = [
  "지금 혼잡한 부스는 어디야?",
  "곧 시작하는 공연 알려줘",
  "먹거리 부스 추천해줘",
  "관리자 페이지는 어떻게 들어가?",
];

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { role: "bot", text: "축제 관련 질문을 입력해 주세요." },
  ]);

  function resetMessages() {
    setMessages([
      { role: "bot", text: "대화를 초기화했습니다. 새 질문을 입력해 주세요." },
    ]);
  }

  async function submitQuestion(text) {
    if (!text.trim()) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const response = await askChat(text);
      setMessages((prev) => [...prev, { role: "bot", text: response.answer }]);
      setQuestion("");
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "응답을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await submitQuestion(question);
  }

  return (
    <section className="cyber-page pt-4 space-y-3 scan-enter">
      <article className="rounded-2xl border border-cyan-300/65 bg-gradient-to-br from-[#05345f] via-[#0c5f93] to-[#18b8da] p-4 text-cyan-50 shadow-[0_0_26px_rgba(34,211,238,0.3)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-100/50 bg-cyan-500/25">
              <IconChat className="h-5 w-5 icon-role-ops" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/95">
                Live Assistant
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-role-ops">축제 챗봇</h2>
              <p className="mt-1 text-xs text-cyan-100/90">
                운영 정보, 공연 일정, 부스 추천을 빠르게 물어보세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetMessages}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-cyan-200/70 bg-cyan-500/20 px-3 py-1.5 text-cyan-100 text-role-log"
          >
            <IconRefresh className="h-3.5 w-3.5 icon-role-log" />
            대화 초기화
          </button>
        </div>
      </article>

      <div className="flex flex-wrap gap-1.5">
        {quickQuestions.map((q) => (
          <button
            key={q}
            type="button"
            className="rounded-full border border-cyan-300/50 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-cyan-100"
            onClick={() => submitQuestion(q)}
          >
            {q}
          </button>
        ))}
      </div>

      <article className="rounded-2xl border border-cyan-300/50 bg-slate-950/85 p-3 min-h-64 max-h-[55vh] overflow-auto space-y-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)]">
        {messages.slice(-12).map((message, idx) => {
          const isUser = message.role === "user";
          return (
            <div key={`${message.role}-${idx}`} className={isUser ? "text-right" : "text-left"}>
              <p className={`text-[10px] text-cyan-200/70 mb-1 inline-flex items-center gap-1 ${isUser ? "" : "text-role-ops"}`}>
                {isUser ? (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300" />
                    나
                  </>
                ) : (
                  <>
                    <IconChat className="h-3 w-3 icon-role-ops" />
                    챗봇
                  </>
                )}
              </p>
              <p
                className={`inline-block max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  isUser
                    ? "bg-gradient-to-r from-cyan-600 to-blue-500 text-white"
                    : "border border-cyan-400/30 bg-slate-900/80 text-cyan-100"
                }`}
              >
                {message.text}
              </p>
            </div>
          );
        })}
        {loading && <p className="text-sm text-cyan-200/80">답변 생성 중...</p>}
      </article>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-cyan-300/50 bg-slate-950/80 p-2.5 flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="flex-1 rounded-xl border border-cyan-400/35 bg-slate-900/80 px-3 py-2 text-cyan-100 placeholder:text-cyan-200/55"
          placeholder="예: 지금 혼잡한 부스는 어디야?"
          aria-label="질문 입력"
        />
        <button
          className="rounded-xl border border-cyan-200/80 bg-gradient-to-r from-cyan-600 to-blue-500 px-4 font-semibold text-white"
          type="submit"
          disabled={loading}
        >
          전송
        </button>
      </form>
    </section>
  );
}
