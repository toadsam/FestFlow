import { useState } from 'react';
import { askChat } from '../api';

const quickQuestions = [
  '지금 혼잡한 부스는 어디야?',
  '곧 시작하는 공연 알려줘',
  '먹거리 부스 추천해줘',
  '관리자 페이지는 어떻게 들어가?',
];

export default function ChatPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([{ role: 'bot', text: '축제 관련 질문을 입력해 주세요.' }]);

  function resetMessages() {
    setMessages([{ role: 'bot', text: '대화를 초기화했습니다. 새 질문을 입력해 주세요.' }]);
  }

  async function submitQuestion(text) {
    if (!text.trim()) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const response = await askChat(text);
      setMessages((prev) => [...prev, { role: 'bot', text: response.answer }]);
      setQuestion('');
    } catch {
      setMessages((prev) => [...prev, { role: 'bot', text: '응답을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await submitQuestion(question);
  }

  return (
    <section className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">축제 챗봇</h2>
        <button type="button" onClick={resetMessages} className="text-xs rounded-lg border px-2 py-1">
          대화 초기화
        </button>
      </div>

      <div className="rounded-2xl bg-slate-900 text-white p-4 min-h-44 space-y-3">
        {messages.slice(-10).map((message, idx) => (
          <div key={`${message.role}-${idx}`} className={message.role === 'user' ? 'text-right' : ''}>
            <p className="text-xs opacity-60 mb-1">{message.role === 'user' ? '나' : '챗봇'}</p>
            <p className={`inline-block max-w-[90%] rounded-lg px-3 py-2 ${message.role === 'user' ? 'bg-teal-600' : 'bg-slate-700'}`}>
              {message.text}
            </p>
          </div>
        ))}
        {loading && <p className="text-sm opacity-70">답변 생성 중...</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {quickQuestions.map((q) => (
          <button key={q} type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs" onClick={() => submitQuestion(q)}>
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
          placeholder="예: 지금 혼잡한 부스는 어디야?"
          aria-label="질문 입력"
        />
        <button className="rounded-xl bg-amber-500 text-white px-4 font-semibold" type="submit" disabled={loading}>
          전송
        </button>
      </form>
    </section>
  );
}
