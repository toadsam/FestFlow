import { useState } from "react";
import { askChat } from "../api";
import { IconChat, IconSend } from "../components/UxIcons";

const quickPrompts = [
  "지금 공연 뭐 있어?",
  "사람 적은 부스 추천해줘",
  "푸드트럭 어디 있어?",
];

const botFallback =
  "지금은 응답을 불러오지 못했어요. 공연은 18:30부터 노천극장에서 시작하고, 사람이 적은 곳은 응급 케어 스팟과 체험존을 먼저 확인해보세요.";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "안녕하세요! FestFlow AI 챗봇이에요. 축제에 대한 궁금한 점을 물어보세요!",
    },
  ]);

  async function submit(text) {
    const question = text.trim();
    if (!question || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const result = await askChat(question);
      setMessages((prev) => [...prev, { role: "bot", text: result.answer || botFallback }]);
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: botFallback }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    submit(input);
  }

  return (
    <section className="uni-page chat-page">
      <header className="plain-page-header">
        <span />
        <h1>AI 챗봇</h1>
        <span />
      </header>

      <div className="chat-thread">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "chat-message chat-message--user" : "chat-message"}
          >
            {message.role === "bot" && (
              <span className="chat-avatar">
                <IconChat className="h-4 w-4" />
              </span>
            )}
            <p>{message.text}</p>
          </div>
        ))}
        {loading && (
          <div className="chat-message">
            <span className="chat-avatar">
              <IconChat className="h-4 w-4" />
            </span>
            <p>축제 데이터를 확인하고 있어요...</p>
          </div>
        )}
      </div>

      <div className="quick-prompt-row">
        {quickPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => submit(prompt)} disabled={loading}>
            {prompt}
          </button>
        ))}
      </div>

      <form className="chat-input-bar" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="메시지를 입력하세요..."
          aria-label="챗봇 질문 입력"
        />
        <button type="submit" disabled={loading || !input.trim()} aria-label="전송">
          <IconSend className="h-5 w-5" />
        </button>
      </form>
    </section>
  );
}
