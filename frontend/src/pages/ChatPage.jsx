import { useState } from 'react';
import { askChat } from '../api';

export default function ChatPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('축제 관련 질문을 입력해 주세요.');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    try {
      const response = await askChat(question);
      setAnswer(response.answer);
      setQuestion('');
    } catch {
      setAnswer('응답을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pt-4 space-y-4">
      <h2 className="text-lg font-bold">축제 챗봇</h2>

      <div className="rounded-2xl bg-slate-900 text-white p-4 min-h-28">
        <p className="text-sm opacity-70 mb-2">Bot</p>
        <p className="leading-relaxed">{loading ? '답변 생성 중...' : answer}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
          placeholder="예: 지금 혼잡한 부스는 어디야?"
        />
        <button className="rounded-xl bg-amber-500 text-white px-4 font-semibold" type="submit">
          전송
        </button>
      </form>
    </section>
  );
}
