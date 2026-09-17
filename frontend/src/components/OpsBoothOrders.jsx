// 부스 운영 콘솔의 "주문" 구역. 주문 받기 설정 + 실시간 주문 목록. 스타일은 styles/v2-ops.css.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createOrderStream,
  fetchOpsBoothOrders,
  updateOpsBoothOrderConfig,
  updateOpsBoothOrderStatus,
} from "../api";
import { formatWon } from "../utils/orderCart";

const STATUS_LABEL = {
  PENDING_PAYMENT: "입금 대기",
  PAID: "입금 확인",
  PREPARING: "조리 중",
  READY: "준비 완료",
  COMPLETED: "완료",
  CANCELED: "취소",
};

const STATUS_TONE = {
  PENDING_PAYMENT: "yellow",
  PAID: "blue",
  PREPARING: "violet",
  READY: "green",
  COMPLETED: "",
  CANCELED: "red",
};

const NEXT_ACTION = {
  PENDING_PAYMENT: { status: "PAID", label: "입금 확인" },
  PAID: { status: "PREPARING", label: "조리 시작" },
  PREPARING: { status: "READY", label: "준비 완료" },
  READY: { status: "COMPLETED", label: "완료" },
};

function formatTime(value) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(11, 16);
}

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    // 소리는 없어도 된다
  }
}

export default function OpsBoothOrders({ boothId, opsKey, notify, onSummary }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [config, setConfig] = useState({ orderEnabled: true, bankAccount: "", bankHolder: "" });
  const [savedConfig, setSavedConfig] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const knownIds = useRef(new Set());
  const freshIds = useRef(new Set());

  const say = (text, tone) => (notify ? notify(text, tone) : undefined);

  async function load(silent = false) {
    if (!boothId || !opsKey) return;
    if (!silent) setLoading(true);
    try {
      const next = await fetchOpsBoothOrders(boothId, opsKey);
      setData(next);
      const nextConfig = {
        orderEnabled: next.orderEnabled ?? true,
        bankAccount: next.bankAccount ?? "",
        bankHolder: next.bankHolder ?? "",
      };
      setConfig(nextConfig);
      setSavedConfig(JSON.stringify(nextConfig));
      setError("");
    } catch (e) {
      setError(e.message || "주문을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boothId, opsKey]);

  useEffect(() => {
    if (!data) return;
    (data.orders || []).forEach((order) => knownIds.current.add(order.id));
  }, [data]);

  useEffect(() => {
    if (!boothId || !opsKey) return undefined;
    const stream = createOrderStream();
    let timer = null;
    stream.addEventListener("orders", (event) => {
      try {
        const order = JSON.parse(event.data);
        if (String(order.boothId) !== String(boothId)) return;
        if (order.status === "PENDING_PAYMENT" && !knownIds.current.has(order.id)) {
          knownIds.current.add(order.id);
          freshIds.current.add(order.id);
          window.setTimeout(() => freshIds.current.delete(order.id), 60000);
          setFlash(`새 주문 · ${order.tableLabel} 테이블 · ${formatWon(order.totalAmount)}`);
          playChime();
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(() => setFlash(""), 8000);
        }
        load(true);
      } catch {
        // ignore
      }
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      stream.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boothId, opsKey]);

  const allOrders = data?.orders || [];
  const orders = useMemo(
    () => (showAll ? allOrders : allOrders.filter((order) => order.status !== "COMPLETED" && order.status !== "CANCELED")),
    [allOrders, showAll],
  );

  const pendingCount = allOrders.filter((o) => o.status === "PENDING_PAYMENT").length;
  const cookingCount = allOrders.filter((o) => o.status === "PAID" || o.status === "PREPARING").length;
  const readyCount = allOrders.filter((o) => o.status === "READY").length;

  useEffect(() => {
    onSummary?.({ pending: pendingCount, cooking: cookingCount, ready: readyCount });
  }, [pendingCount, cookingCount, readyCount, onSummary]);

  async function changeStatus(order, status) {
    if (status === "CANCELED" && !window.confirm(`${order.tableLabel} 테이블 주문 #${order.orderNo || order.id}을 취소할까요?`)) return;
    setBusyId(order.id);
    try {
      await updateOpsBoothOrderStatus(boothId, order.id, status, opsKey);
      await load(true);
      say(`${order.tableLabel} 테이블 · ${STATUS_LABEL[status] || status}`, "success");
    } catch (e) {
      say(e.message || "상태를 바꾸지 못했어요.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const next = await updateOpsBoothOrderConfig(
        boothId,
        { orderEnabled: config.orderEnabled, bankAccount: config.bankAccount, bankHolder: config.bankHolder },
        opsKey,
      );
      setData(next);
      setSavedConfig(JSON.stringify(config));
      setError("");
      say("주문 설정을 저장했어요.", "success");
    } catch (e) {
      say(e.message || "주문 설정을 저장하지 못했어요.", "error");
    } finally {
      setSavingConfig(false);
    }
  }

  if (!boothId || !opsKey) return null;

  const configDirty = savedConfig && JSON.stringify(config) !== savedConfig;

  return (
    <>
      <article className="ops-card">
        <div className="ops-card__head">
          <div>
            <h2>주문</h2>
            <p>손님이 테이블 QR로 넣은 주문이 바로 떠요. 입금 확인 → 조리 → 준비 완료 순서로 눌러요.</p>
          </div>
          <div className="ops-card__actions">
            <span className="ops-chip ops-chip--yellow">대기 {pendingCount}</span>
            <span className="ops-chip ops-chip--violet">조리 {cookingCount}</span>
            <span className="ops-chip ops-chip--green">준비 {readyCount}</span>
          </div>
        </div>

        {flash && <div className="ops-banner">{flash}</div>}
        {error && <div className="ops-banner ops-banner--red">{error}</div>}

        <div className="ops-row ops-row--between ops-row--wrap">
          <div className="ops-seg">
            <button type="button" className={!showAll ? "ops-seg--on" : ""} onClick={() => setShowAll(false)}>처리 중</button>
            <button type="button" className={showAll ? "ops-seg--on" : ""} onClick={() => setShowAll(true)}>오늘 전체</button>
          </div>
          <Link to={`/ops/booth/${boothId}/table-qr`} className="ops-btn ops-btn--ghost ops-btn--sm">주문 QR 인쇄</Link>
        </div>

        {loading && !data && <div className="ops-skeleton" style={{ height: 120 }} />}

        {data && orders.length === 0 && (
          <div className="ops-empty">
            {showAll ? "오늘 들어온 주문이 없어요." : "처리 중인 주문이 없어요. 손님이 QR로 주문하면 여기 바로 떠요."}
          </div>
        )}

        {orders.length > 0 && (
          <div className="ops-orders">
            {orders.map((order) => {
              const next = NEXT_ACTION[order.status];
              const active = order.status !== "COMPLETED" && order.status !== "CANCELED";
              const busy = busyId === order.id;
              const fresh = freshIds.current.has(order.id) && order.status === "PENDING_PAYMENT";
              return (
                <div key={order.id} className={`ops-order${fresh ? " ops-order--new" : ""}${active ? "" : " ops-order--done"}`}>
                  <div className="ops-order__head">
                    <div>
                      <div className="ops-order__table">{order.tableLabel} 테이블</div>
                      <div className="ops-order__meta">
                        #{order.orderNo || order.id} · {formatTime(order.createdAt)} · {order.depositorName}
                        {order.phoneNumber ? ` · ${order.phoneNumber}` : ""}
                      </div>
                    </div>
                    <span className={`ops-chip ops-chip--dot ops-chip--${STATUS_TONE[order.status] || ""}`}>{STATUS_LABEL[order.status] || order.status}</span>
                  </div>
                  <ul className="ops-order__items">
                    {order.items?.map((item) => (
                      <li key={`${order.id}-${item.name}`}>
                        <span>{item.name}<em>× {item.quantity}</em></span>
                        <span>{formatWon(item.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                  {order.request && <div className="ops-order__request">요청 · {order.request}</div>}
                  <div className="ops-order__foot">
                    <span className="ops-order__total">{formatWon(order.totalAmount)}</span>
                    {active && (
                      <div className="ops-row">
                        <button type="button" className="ops-btn ops-btn--danger ops-btn--sm" disabled={busy} onClick={() => changeStatus(order, "CANCELED")}>취소</button>
                        {next && (
                          <button type="button" className="ops-btn ops-btn--primary ops-btn--sm" disabled={busy} onClick={() => changeStatus(order, next.status)}>
                            {busy ? "처리 중…" : next.label}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="ops-card">
        <div className="ops-card__head">
          <div>
            <h2>주문 받기</h2>
            <p>계좌는 손님 결제 화면에 그대로 보여요. 메뉴 가격은 메뉴판의 숫자를 써요.</p>
          </div>
          <div className="ops-card__actions">
            <button type="button" className={`ops-btn ops-btn--sm ${configDirty ? "ops-btn--primary" : "ops-btn--ghost"}`} disabled={savingConfig || !configDirty} onClick={saveConfig}>
              {savingConfig ? "저장 중…" : configDirty ? "설정 저장" : "저장됨"}
            </button>
          </div>
        </div>
        <label className="ops-switch">
          <span className="ops-switch__text">
            <strong>QR 주문 받기</strong>
            <small>끄면 손님 QR 화면에 "주문을 받지 않아요"가 떠요.</small>
          </span>
          <input type="checkbox" checked={config.orderEnabled} onChange={(e) => setConfig((c) => ({ ...c, orderEnabled: e.target.checked }))} />
          <span className="ops-switch__knob" />
        </label>
        <div className="ops-grid-2">
          <label className="ops-field">
            <span>입금 계좌</span>
            <input value={config.bankAccount} onChange={(e) => setConfig((c) => ({ ...c, bankAccount: e.target.value }))} placeholder="예) 국민 000000-00-000000" maxLength={200} />
          </label>
          <label className="ops-field">
            <span>예금주</span>
            <input value={config.bankHolder} onChange={(e) => setConfig((c) => ({ ...c, bankHolder: e.target.value }))} placeholder="예) 아주대 총학생회" maxLength={60} />
          </label>
        </div>
      </article>
    </>
  );
}
