const API_BASE = 'http://localhost:8080/api';

export async function fetchBooths() {
  const response = await fetch(`${API_BASE}/booths`);
  if (!response.ok) throw new Error('부스 목록을 가져오지 못했습니다.');
  return response.json();
}

export async function fetchCongestion(boothId) {
  const response = await fetch(`${API_BASE}/booths/${boothId}/congestion`);
  if (!response.ok) throw new Error('혼잡도 조회에 실패했습니다.');
  return response.json();
}

export async function fetchEvents() {
  const response = await fetch(`${API_BASE}/events`);
  if (!response.ok) throw new Error('공연 목록을 가져오지 못했습니다.');
  return response.json();
}

export async function sendGps(latitude, longitude) {
  const response = await fetch(`${API_BASE}/gps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude }),
  });
  if (!response.ok) throw new Error('GPS 전송에 실패했습니다.');
  return response.json();
}

export async function askChat(question) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) throw new Error('챗봇 응답에 실패했습니다.');
  return response.json();
}
