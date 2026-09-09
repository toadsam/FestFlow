import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { fetchBoothById } from "../../api";
import "../../styles/order.css";

// 부스 테이블마다 붙일 QR 인쇄 페이지. QR 안에는 /order/{부스}/{테이블} 주소만 들어간다.
export default function TableQrPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const count = Math.min(60, Math.max(1, Number(searchParams.get("count")) || 10));
  const from = Math.max(1, Number(searchParams.get("from")) || 1);

  const [booth, setBooth] = useState(null);
  const [images, setImages] = useState({});

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const labels = useMemo(() => Array.from({ length: count }, (_, i) => String(from + i)), [count, from]);

  useEffect(() => {
    fetchBoothById(id).then(setBooth).catch(() => setBooth(null));
  }, [id]);

  useEffect(() => {
    let alive = true;
    Promise.all(
      labels.map((label) =>
        QRCode.toDataURL(`${origin}/order/${id}/${encodeURIComponent(label)}`, { margin: 1, width: 320, errorCorrectionLevel: "M" })
          .then((url) => [label, url])
          .catch(() => [label, ""]),
      ),
    ).then((pairs) => alive && setImages(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [id, labels, origin]);

  function updateParam(name, value) {
    const next = new URLSearchParams(searchParams);
    next.set(name, String(value));
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="od-qr-page">
      <div className="od-noprint" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>테이블 QR 인쇄</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#556" }}>
          손님이 QR을 찍으면 이 부스의 메뉴가 열리고 그 테이블 번호로 주문이 들어와요. 잘라서 테이블마다 붙여 주세요.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>
            시작 번호{" "}
            <input type="number" min="1" value={from} onChange={(e) => updateParam("from", Math.max(1, Number(e.target.value) || 1))} style={{ width: 64, padding: 6, border: "1px solid #ccd", borderRadius: 8 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            개수{" "}
            <input type="number" min="1" max="60" value={count} onChange={(e) => updateParam("count", Math.min(60, Math.max(1, Number(e.target.value) || 1)))} style={{ width: 64, padding: 6, border: "1px solid #ccd", borderRadius: 8 }} />
          </label>
          <button type="button" onClick={() => window.print()} style={{ marginLeft: "auto", padding: "8px 14px", border: 0, borderRadius: 10, background: "#2b6de0", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            인쇄하기
          </button>
        </div>
      </div>

      <div className="od-qr-grid">
        {labels.map((label) => (
          <div key={label} className="od-qr-card">
            <span className="od-qr-card__booth">{booth?.name || `부스 ${id}`}</span>
            <span className="od-qr-card__table">테이블 {label}</span>
            {images[label] ? <img src={images[label]} alt={`테이블 ${label} 주문 QR`} /> : <div style={{ width: 180, height: 180, background: "#eef" }} />}
            <span className="od-qr-card__hint">카메라로 찍으면 메뉴가 열려요</span>
          </div>
        ))}
      </div>
    </div>
  );
}
