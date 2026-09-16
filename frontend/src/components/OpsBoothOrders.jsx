import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createOrderStream,
  fetchOpsBoothOrders,
  updateOpsBoothOrderConfig,
  updateOpsBoothOrderStatus,
} from "../api";
import { IconClipboard } from "./UxIcons";
import { formatWon } from "../utils/orderCart";

const STATUS_LABEL = {
  PENDING_PAYMENT: "입금 대기",
  PAID: "입금 확인",
  PREPARING: "조리 중",
  READY: "준비 완료",
  COMPLETED: "완료",
  CANCELED: "취소",
};

const STATUS_CLASS = {
  PENDING_PAYMENT: "bg-amber-50 text-amber-800 border-amber-200",
  PAID: "bg-sky-50 text-sky-800 border-sky-200",
  PREPARING: "bg-indigo-50 text-indigo-800 border-indigo-200",
  READY: "bg-emerald-50 text-emerald-800 border-emerald-200",
  COMPLETED: "bg-slate-100 text-slate-600 border-slate-200",
  CANCELED: "bg-rose-50 text-rose-700 border-rose-200",
};

const NEXT_ACTION = {
  PENDING_PAYMENT: { status: "PAID", label: "입금 확인" },
  PAID: { status: "PREPARING", label: "조리 시작" },
  PREPARING: { status: "READY", label: "준비 완료" },
  READY: { status: "COMPLETED", label: "완료 처리" },
};

function formatTime(value) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(5, 16);
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

/**
 * 부스 운영 콘솔의 "테이블 QR 주문" 섹션.
 * OpsBoothPage 안에 끼워 넣는 독립 컴포넌트라 페이지 본체를 거의 건드리지 않는다.
 */
export default function OpsBoothOrders({ boothId, opsKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [config, setConfig] = useState({ orderEnabled: true, bankAccount: "", bankHolder: "" });
  const [savingConfig, setSavingConfig] = useState(false);
  const [qrCount, setQrCount] = useState(10);
  const knownIds = useRef(new Set());

  async function load(silent = false) {
    if (!boothId || !opsKey) return;
    if (!silent) setLoading(true);
    try {
      const next = await fetchOpsBoothOrders(boothId, opsKey);
      setData(next);
      setConfig({
        orderEnabled: next.orderEnabled ?? true,
        bankAccount: next.bankAccount ?? "",
        bankHolder: next.bankHolder ?? "",
      });
      setError("");
    } catch (e) {
      setError(e.message || "주문 목록을 불러오지 못했습니다.");
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
          setMessage(`새 주문 #${order.orderNo || order.id} · 테이블 ${order.tableLabel} · ${formatWon(order.totalAmount)}`);
          playChime();
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(() => setMessage(""), 8000);
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

  const orders = useMemo(() => {
    const list = data?.orders || [];
    if (showAll) return list;
    return list.filter((order) => order.status !== "COMPLETED" && order.status !== "CANCELED");
  }, [data, showAll]);

  const pendingCount = (data?.orders || []).filter((o) => o.status === "PENDING_PAYMENT").length;
  const cookingCount = (data?.orders || []).filter((o) => o.status === "PAID" || o.status === "PREPARING").length;

  async function changeStatus(order, status) {
    if (status === "CANCELED" && !window.confirm(`주문 #${order.orderNo || order.id} (테이블 ${order.tableLabel})을 취소할까요?`)) return;
    setBusyId(order.id);
    try {
      await updateOpsBoothOrderStatus(boothId, order.id, status, opsKey);
      await load(true);
    } catch (e) {
      setError(e.message || "상태 변경에 실패했습니다.");
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
      setMessage("주문 설정을 저장했습니다.");
      window.setTimeout(() => setMessage(""), 3000);
      setError("");
    } catch (e) {
      setError(e.message || "주문 설정 저장에 실패했습니다.");
    } finally {
      setSavingConfig(false);
    }
  }

  if (!boothId || !opsKey) return null;

  return (
    <article className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {message && (
        <div className="border-b border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800">{message}</div>
      )}
      <div className="p-3 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-role-ops inline-flex items-center gap-1.5">
            <IconClipboard className="h-4 w-4 icon-role-ops" />
            테이블 QR 주문
          </h3>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">입금 대기 {pendingCount}</span>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-800">조리 {cookingCount}</span>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {loading && !data && <p className="text-sm text-slate-500">불러오는 중...</p>}

        {/* 설정 */}
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700">주문 받기 · 입금 계좌</p>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.orderEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, orderEnabled: e.target.checked }))}
            />
            QR 주문 받기
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              className="border rounded px-2 py-1.5 text-sm"
              placeholder="계좌 (예: 국민 000000-00-000000)"
              value={config.bankAccount}
              onChange={(e) => setConfig((c) => ({ ...c, bankAccount: e.target.value }))}
              maxLength={200}
            />
            <input
              className="border rounded px-2 py-1.5 text-sm w-28"
              placeholder="예금주"
              value={config.bankHolder}
              onChange={(e) => setConfig((c) => ({ ...c, bankHolder: e.target.value }))}
              maxLength={60}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">메뉴 가격은 위 메뉴판의 숫자를 그대로 씁니다 (예: 12000원).</p>
            <button
              type="button"
              onClick={saveConfig}
              disabled={savingConfig}
              className="rounded border border-cyan-500 px-3 py-1.5 text-xs font-semibold text-cyan-700 disabled:opacity-50"
            >
              {savingConfig ? "저장 중..." : "설정 저장"}
            </button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <label className="text-xs text-slate-600">
              테이블 수{" "}
              <input
                type="number"
                min="1"
                max="60"
                value={qrCount}
                onChange={(e) => setQrCount(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 border rounded px-2 py-1 text-sm"
              />
            </label>
            <Link
              to={`/ops/booth/${boothId}/table-qr?count=${qrCount}`}
              className="rounded border px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              테이블 QR 인쇄
            </Link>
          </div>
        </section>

        {/* 주문 목록 */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">{showAll ? "오늘 주문 전체" : "처리 중인 주문"}</p>
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-slate-500 underline">
              {showAll ? "처리 중만 보기" : "완료·취소 포함"}
            </button>
          </div>

          {data && orders.length === 0 && (
            <p className="text-[11px] text-slate-500">
              {showAll ? "오늘 들어온 주문이 없습니다." : "처리 중인 주문이 없습니다. 손님이 테이블 QR로 주문하면 여기에 바로 뜹니다."}
            </p>
          )}

          {orders.map((order) => {
            const next = NEXT_ACTION[order.status];
            const active = order.status !== "COMPLETED" && order.status !== "CANCELED";
            const busy = busyId === order.id;
            return (
              <div key={order.id} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-900">
                      #{order.orderNo || order.id} · 테이블 {order.tableLabel}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatTime(order.createdAt)} · 입금자 {order.depositorName}
                      {order.phoneNumber ? ` · ${order.phoneNumber}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[order.status] || ""}`}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                </div>
                <ul className="text-xs text-slate-700 space-y-0.5">
                  {order.items?.map((item) => (
                    <li key={`${order.id}-${item.name}`} className="flex justify-between gap-2">
                      <span>
                        {item.name} <span className="text-slate-400">× {item.quantity}</span>
                      </span>
                      <span>{formatWon(item.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
                {order.request && <p className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1">요청: {order.request}</p>}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{formatWon(order.totalAmount)}</span>
                  {active && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => changeStatus(order, "CANCELED")}
                        disabled={busy}
                        className="rounded border px-2 py-1 text-[11px] text-rose-600 disabled:opacity-50"
                      >
                        취소
                      </button>
                      {next && (
                        <button
                          type="button"
                          onClick={() => changeStatus(order, next.status)}
                          disabled={busy}
                          className="rounded bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          {busy ? "처리 중" : next.label}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </article>
  );
}
