"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { listSamples, sampleAdapter } from "@/lib/adapters/sample";
import { parseCsv } from "@/lib/adapters/csv";
import { FX_SOURCE_LABEL } from "@/lib/client/fx";
import { GmailImportError, importFromGmail, summarizeSkipped, type GmailProgress } from "@/lib/client/gmail";
import { useHydrated } from "@/lib/client/guards";
import { createManualSubscription, runInterpret, STAGE_LABEL, type ManualInput, type PipelineStage } from "@/lib/client/pipeline";
import { useAppStore } from "@/lib/client/store";
import type { Transaction, Usage } from "@/lib/types";
import { AppBar } from "./AppBar";
import { BottomSheet } from "./BottomSheet";
import { ErrorBanner } from "./ErrorBanner";
import { InputMethodPicker, type InputMethodId } from "./InputMethodPicker";
import { ManualAddSheet } from "./ManualAddSheet";
import { PrivacyNotice } from "./PrivacyNotice";

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

// 첫 화면 예시. 금액은 카탈로그에 확인된 가격만 써요. 합계는 이 줄들에서 계산해요.
// raw는 카드 명세서에 찍히는 표기, found는 결제 수단만 찍혀서 영수증에서 실제 서비스를 찾은 줄이에요.
const EXAMPLE: { name: string; short: string; amount: number; usage: Usage; date: string; raw: string; found: boolean }[] = [
  { name: "넷플릭스", short: "넷플릭스", amount: 13500, usage: "rarely", date: "11.03", raw: "넷플릭스", found: false },
  { name: "카카오톡 이모티콘 플러스", short: "이모티콘 플러스", amount: 6900, usage: "sometimes", date: "11.05", raw: "카카오페이", found: true },
  { name: "아이클라우드", short: "아이클라우드", amount: 1100, usage: "rarely", date: "11.15", raw: "Apple", found: true },
  { name: "다글로", short: "다글로", amount: 14900, usage: "often", date: "11.20", raw: "다글로", found: false },
];
const EXAMPLE_TOTAL = EXAMPLE.reduce((sum, row) => sum + row.amount, 0);
const EXAMPLE_RARELY = EXAMPLE.filter((row) => row.usage === "rarely").reduce((sum, row) => sum + row.amount, 0);
const USAGE_WORD: Record<Usage, string> = { often: "자주", sometimes: "가끔", rarely: "거의 안 씀" };

const CSV_REASON: Record<string, string> = {
  invalid_header: "첫 줄(제목 줄)을 읽지 못했어요",
  invalid_csv: "따옴표나 쉼표가 맞지 않아요",
  invalid_columns: "칸 수가 제목 줄과 달라요",
  invalid_date: "날짜를 읽지 못했어요",
  invalid_amount: "금액을 읽지 못했어요",
  invalid_transaction: "비어 있는 칸이 있어요",
  duplicate: "위와 똑같은 줄이에요",
};

type Report = {
  source: "sample" | "gmail" | "csv";
  found: number;
  /** 찾은 구독의 월 환산 합계 (규칙이 계산한 monthly_amount의 합) */
  monthlyTotal: number;
  degraded: boolean;
  gmail?: { mailCount: number; foreign: number; noAmount: number; converted: number; fxDate: string | null; fxAvailable: boolean };
  csvSkipped?: { line: number; reason: string }[];
};
type Failure = { title: string; detail: string };

const primaryButton = "flex min-h-12 w-full items-center justify-center rounded-[6px] bg-primary px-5 text-base font-semibold text-primary-fg transition-[transform,background-color] hover:bg-[#262626] active:scale-[0.98]";
// 보조 버튼은 회색 알약(#e5e5e5). 채운 버튼은 화면에 하나(검정)만 둬요.
const secondaryButton = "flex min-h-12 w-full items-center justify-center rounded-[6px] bg-pill px-5 text-base font-semibold text-ink transition-[transform,background-color] hover:bg-[#dadada] active:scale-[0.98]";

export function InputScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const existing = useAppStore((state) => state.subscriptions);
  const resetAll = useAppStore((state) => state.resetAll);
  const addSubscription = useAppStore((state) => state.addSubscription);
  const setPhase = useAppStore((state) => state.setPhase);

  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [gmailIntroOpen, setGmailIntroOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const demoStarted = useRef(false);

  function begin(label: string) {
    setFailure(null);
    setReport(null);
    setBusy(label);
  }

  async function analyze(transactions: Transaction[], source: Report["source"], extra: Partial<Report> = {}) {
    const result = await runInterpret(transactions, { onStage: (stage: PipelineStage) => setBusy(STAGE_LABEL[stage]) });
    setBusy(null);
    const monthlyTotal = result.subscriptions.reduce((sum, sub) => sum + sub.monthly_amount, 0);
    const next: Report = { source, found: result.subscriptions.length, monthlyTotal, degraded: result.degraded, ...extra };
    const skippedMail = next.gmail ? next.gmail.foreign + next.gmail.noAmount + next.gmail.converted : 0;
    // 샘플 체험(시연 /?demo=1 포함)은 AI가 실패해도 멈추지 않고 바로 구독 확인으로 가요 (카드마다 '확인 필요'로 보여요).
    if (source === "sample" && next.found > 0) {
      router.push("/confirm");
      return;
    }
    // 그 밖에는 알려 줄 게 있으면 이 화면에서 요약을 보여 주고, 없으면 바로 구독 확인으로 가요.
    if (next.found === 0 || next.degraded || skippedMail > 0 || (next.csvSkipped?.length ?? 0) > 0) setReport(next);
    else router.push("/confirm");
  }

  async function startSample(id: string) {
    setSampleOpen(false);
    begin("결제 내역을 정리하고 있어요");
    try {
      await analyze(await sampleAdapter.load(id), "sample");
    } catch {
      setBusy(null);
      setFailure({ title: "샘플을 불러오지 못했어요", detail: "다른 샘플을 고르거나 구독을 직접 추가해 주세요." });
    }
  }

  async function startGmail() {
    setGmailIntroOpen(false);
    begin("Google 로그인 창을 여는 중");
    try {
      const result = await importFromGmail({
        onProgress: (progress: GmailProgress) => {
          if (progress.stage === "auth") setBusy("Google 로그인 창에서 허용해 주세요");
          else if (progress.stage === "searching") setBusy(`영수증 메일 찾는 중 (${progress.found}통)`);
          else setBusy(`영수증 메일 읽는 중 (${progress.done}/${progress.total}통)`);
        },
      });
      const skipped = summarizeSkipped(result.skipped);
      if (result.transactions.length === 0) {
        setBusy(null);
        setFailure({ title: "영수증 메일을 찾지 못했어요", detail: "최근 6개월에 금액을 읽을 수 있는 영수증이 없어요. 영수증이 없는 구독은 직접 추가해 주세요." });
        return;
      }
      setBusy("결제 정리 중");
      await analyze(result.transactions, "gmail", {
        gmail: { mailCount: result.mailCount, foreign: skipped.foreign, noAmount: skipped.noAmount, converted: result.converted, fxDate: result.fxDate, fxAvailable: result.fxAvailable },
      });
    } catch (error) {
      setBusy(null);
      const code = error instanceof GmailImportError ? error.code : "network";
      setFailure(
        code === "denied"
          ? { title: "Gmail 권한을 허용해야 불러올 수 있어요", detail: "다시 시도하거나, 샘플로 체험하거나, 구독을 직접 추가할 수 있어요." }
          : code === "rate_limited"
            ? { title: "Gmail 사용량 한도에 잠깐 걸렸어요", detail: "1분쯤 뒤에 다시 시도해 주세요. 샘플이나 직접 추가로도 진행할 수 있어요." }
          : code === "not_configured"
            ? { title: "Gmail 연결이 아직 준비되지 않았어요", detail: "샘플로 체험하거나 구독을 직접 추가해 주세요." }
            : { title: "Gmail에 연결하지 못했어요", detail: "인터넷 연결을 확인하고 다시 시도해 주세요. 샘플이나 직접 추가로도 진행할 수 있어요." },
      );
    }
  }

  async function onCsvFile(file: File | undefined) {
    if (!file) return;
    begin("파일을 읽는 중");
    try {
      // 파일은 이 기기에서만 읽어요. 서버로 보내지 않아요.
      const { transactions, skipped } = parseCsv(await file.text());
      if (transactions.length === 0) {
        setBusy(null);
        setReport({ source: "csv", found: 0, monthlyTotal: 0, degraded: false, csvSkipped: skipped });
        return;
      }
      await analyze(transactions, "csv", { csvSkipped: skipped });
    } catch {
      setBusy(null);
      setFailure({ title: "파일을 읽지 못했어요", detail: "CSV 파일인지 확인해 주세요." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onMethod(id: InputMethodId) {
    if (id === "gmail") setGmailIntroOpen(true);
    else if (id === "csv") fileRef.current?.click();
  }

  function onManualAdd(input: ManualInput) {
    addSubscription(createManualSubscription(input));
    setPhase("confirming");
    setManualOpen(false);
    router.push("/confirm");
  }

  // /?demo=1: 페르소나 ①로 이 화면을 건너뛰고 바로 분석 (시연용)
  useEffect(() => {
    if (!hydrated || demoStarted.current) return;
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    demoStarted.current = true;
    // 시연은 항상 처음 상태에서 시작해요.
    void Promise.resolve().then(() => {
      resetAll();
      return startSample(listSamples()[0].id);
    });
    // startSample은 렌더마다 새로 만들어지지만 한 번만 실행해요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const samples = listSamples();
  const showExisting = hydrated && existing.length > 0 && !busy && !report;
  const needsUsage = existing.some((sub) => sub.usage === null);

  return (
    <main className="flex flex-1 flex-col pb-10">
      <AppBar />
      <PrivacyNotice />

      {/*
        A안 영수증 원장: 왼쪽에 제목·넣는 방법과 "카드 명세서에는 이렇게만 찍혀요" 예시,
        오른쪽에 정리 결과 영수증 한 장. 화면 장식에 색 없이 잉크와 회색만, 코발트는 "새는 돈" 숫자에만.
      */}
      <div className="flex flex-col lg:mt-9 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-14">
        <div className="flex flex-col">
          <section className="px-4 pt-7 lg:pt-0">
            <h1 className="text-[28px] font-bold leading-[1.25] tracking-[-0.02em] lg:text-[32px]">
              매달 나가는 구독을
              <br />
              한 번에 정리해요
            </h1>
            <p className="mt-3 max-w-[520px] text-base leading-[1.6] text-muted">
              결제 내역을 넣으면 거의 안 쓰는 구독과 받을 수 있는 학생 혜택을 찾아, 아낄 수 있는 금액을 보여 드려요.
            </p>
          </section>

          {showExisting ? (
            <section className="mx-4 mt-6 flex max-w-[440px] items-center gap-3 rounded-[8px] border border-line bg-surface px-5 py-4">
              <p className="flex-1 text-base">
                정리하던 구독 <span className="num font-semibold">{existing.length}개</span>가 있어요.
              </p>
              <Link href={needsUsage ? "/confirm" : "/home"} className="flex min-h-10 items-center rounded-[6px] bg-primary px-4 text-sm font-semibold text-primary-fg transition-colors hover:bg-[#262626]">
                이어서 보기
              </Link>
            </section>
          ) : null}

          {failure ? (
            <section className="mx-4 mt-6 max-w-[440px] rounded-[8px] border border-line bg-surface px-5 py-4" role="alert">
              <p className="text-base font-semibold text-negative">{failure.title}</p>
              <p className="mt-1 text-sm text-ink">{failure.detail}</p>
            </section>
          ) : null}

          <section className="mt-7 px-4" aria-label="결제 내역 넣기">
            {busy ? (
              <div className="flex min-h-[188px] max-w-[440px] flex-col items-center justify-center rounded-[8px] border border-line bg-surface p-5 text-center" role="status" aria-live="polite">
                <span aria-hidden="true" className="mb-4 size-7 animate-spin rounded-full border-[3px] border-rule border-t-ink motion-reduce:animate-none" />
                <p className="text-base font-semibold">{busy}</p>
                <p className="mt-1 text-sm text-muted">결제 내역은 이 기기에서만 정리해요.</p>
              </div>
            ) : report ? (
              <div className="max-w-[560px]">
                <ReportPanel report={report} onManual={() => setManualOpen(true)} onRetry={() => setReport(null)} />
              </div>
            ) : (
              <div className="flex max-w-[440px] flex-col gap-2.5">
                <InputMethodPicker onSelect={onMethod} part="primary" />
                <button type="button" onClick={() => setSampleOpen(true)} className={secondaryButton}>
                  샘플 데이터로 체험
                </button>
                <div className="flex flex-wrap items-center gap-x-4">
                  <button type="button" onClick={() => setManualOpen(true)} className="min-h-11 text-sm font-semibold underline underline-offset-4">
                    구독 직접 추가
                  </button>
                  <InputMethodPicker onSelect={onMethod} part="rest" />
                </div>
              </div>
            )}
          </section>

          {showExisting ? (
            <button type="button" onClick={resetAll} className="mx-4 mt-2 min-h-11 self-start text-sm text-negative underline underline-offset-4">
              내 데이터 지우기
            </button>
          ) : null}

          <StatementExample />
        </div>

        <ReceiptExample />
      </div>

      <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => onCsvFile(event.target.files?.[0])} />

      <BottomSheet open={sampleOpen} onClose={() => setSampleOpen(false)} title="어떤 학생으로 체험할까요?">
        <div className="space-y-2">
          {samples.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => startSample(sample.id)}
              className="block w-full rounded-[10px] bg-ground p-4 text-left transition-colors hover:bg-raised active:scale-[0.99]"
            >
              <span className="block text-base font-semibold">{sample.name}</span>
              <span className="mt-1 block text-sm text-muted">{sample.description}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={gmailIntroOpen} onClose={() => setGmailIntroOpen(false)} title="Gmail 영수증 불러오기">
        <ul className="list-disc space-y-3 pl-5 text-base leading-relaxed">
          <li>최근 6개월의 영수증 메일만 검색해요.</li>
          <li>메일은 이 기기에서만 읽고 저장하지 않아요. 다 읽으면 권한을 바로 돌려줘요.</li>
          <li className="text-muted">테스트 기간이라 Google이 &quot;확인되지 않은 앱&quot; 화면을 보여 줄 수 있어요. &quot;고급&quot;을 누른 뒤 계속하면 돼요.</li>
        </ul>
        <button type="button" onClick={startGmail} className={`mt-6 ${primaryButton}`}>
          Google 계정으로 계속
        </button>
      </BottomSheet>

      <ManualAddSheet open={manualOpen} onClose={() => setManualOpen(false)} onAdd={onManualAdd} />
    </main>
  );
}

function ReportPanel({ report, onManual, onRetry }: { report: Report; onManual: () => void; onRetry: () => void }) {
  const skippedMail = report.gmail ? report.gmail.foreign + report.gmail.noAmount : 0;
  return (
    <div className="space-y-3">
      {report.degraded ? <ErrorBanner>일부는 AI 확인을 못 했어요. 확인 필요로 표시했어요.</ErrorBanner> : null}

      <div className="rounded-[20px] bg-surface p-5">
        <h2 className="text-xl font-semibold">
          {report.found > 0 ? <>구독 <span className="num">{report.found}개</span>를 찾았어요</> : "정기 결제를 찾지 못했어요"}
        </h2>
        {report.found > 0 ? (
          <p className="mt-2 text-base">
            매달 <span className="num text-[28px] font-semibold leading-tight">{won(report.monthlyTotal)}</span>
            <span className="block text-sm text-muted">연간 결제는 12로 나눠 더했어요. 확인 화면에서 고칠 수 있어요.</span>
          </p>
        ) : null}

        {report.gmail ? (
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>영수증 메일 <span className="num">{report.gmail.mailCount}</span>통을 읽었어요.</li>
            {report.gmail.converted > 0 ? (
              <li>
                외화 영수증 <span className="num">{report.gmail.converted}</span>통은 <span className="num">{report.gmail.fxDate}</span> {FX_SOURCE_LABEL}로 원화로 바꿨어요. 카드 청구액과 다를 수 있어 &apos;확인 필요&apos;로 표시했어요.
              </li>
            ) : null}
            {report.gmail.foreign > 0 ? (
              <li>
                외화 영수증 <span className="num">{report.gmail.foreign}</span>통은{" "}
                {report.gmail.fxAvailable ? "결제 금액이 어느 것인지 알 수 없어 건너뛰었어요." : "환율을 받지 못해 건너뛰었어요."} 필요하면 직접 추가해 주세요.
              </li>
            ) : null}
            {report.gmail.noAmount > 0 ? <li>결제 금액을 찾지 못한 메일 <span className="num">{report.gmail.noAmount}</span>통은 건너뛰었어요.</li> : null}
            {skippedMail > 0 || report.found === 0 ? <li>영수증이 없는 구독(카카오톡 알림 등)은 직접 추가해 주세요.</li> : null}
          </ul>
        ) : null}

        {report.csvSkipped && report.csvSkipped.length > 0 ? (
          <div className="mt-3">
            <p className="text-sm font-medium">읽지 못한 줄 <span className="num">{report.csvSkipped.length}</span>개</p>
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm text-muted">
              {report.csvSkipped.slice(0, 20).map((entry) => (
                <li key={`${entry.line}-${entry.reason}`}>
                  <span className="num">{entry.line}</span>번째 줄: {CSV_REASON[entry.reason] ?? "형식이 맞지 않아요"}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-medium">이런 형식이면 읽을 수 있어요</p>
            <pre className="mt-2 overflow-x-auto rounded-[8px] bg-ground p-3 text-sm leading-relaxed">{"일자,금액,가맹점,결제수단\n2025.11.03,13500,넷플릭스,카드\n2025.11.05,\"6,900원\",카카오페이,카카오페이"}</pre>
          </div>
        ) : null}

        {report.found === 0 && report.source !== "csv" ? (
          <p className="mt-3 text-sm text-muted">한 번만 결제한 내역은 구독으로 세지 않아요. 구독을 직접 추가해 주세요.</p>
        ) : null}
      </div>

      {report.found > 0 ? (
        <Link href="/confirm" className={primaryButton}>
          구독 확인하러 가기
        </Link>
      ) : null}
      <div className="flex justify-center gap-2">
        <button type="button" onClick={onManual} className="min-h-11 px-3 text-base font-semibold">구독 직접 추가</button>
        <button type="button" onClick={onRetry} className="min-h-11 px-3 text-base text-muted underline underline-offset-4">다른 방법으로 넣기</button>
      </div>
    </div>
  );
}

/** 예시: 카드 명세서에는 결제 수단 이름만 찍히는 줄이 있어요. 그 아래에 영수증에서 찾은 실제 서비스를 보여 줘요. */
function StatementExample() {
  return (
    <section className="mx-4 mt-10 rounded-[8px] border border-line bg-surface" aria-labelledby="statement-title">
      <div className="flex items-baseline justify-between px-5 pb-3 pt-4">
        <h2 id="statement-title" className="text-[15px] font-semibold">카드 명세서에는 이렇게만 찍혀요</h2>
        <span className="text-xs text-muted">예시</span>
      </div>
      <ul>
        {EXAMPLE.map((row) => (
          <li key={row.date} className={`flex min-h-12 items-center gap-3 border-t border-rule px-5 ${row.found ? "bg-[#f7f8fa] py-3" : ""}`}>
            <span className="num w-11 shrink-0 text-[13px] text-muted">{row.date}</span>
            <span className="min-w-0 flex-1">
              <span className={row.found ? "text-muted" : ""}>{row.raw}</span>
              {row.found ? (
                <span className="mt-0.5 block text-[13px]">
                  <span className="text-muted">→ </span>
                  {row.name} · 영수증에서 찾았어요
                </span>
              ) : null}
            </span>
            <span className="num shrink-0 font-semibold">{won(row.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 예시: 정리 결과를 영수증 한 장으로. 아래 톱니 가장자리는 영수증 종이 모양이에요(.receipt). 코발트는 "새는 돈" 숫자에만. */
function ReceiptExample() {
  const rows = [...EXAMPLE].sort((a, b) => b.amount - a.amount);
  return (
    <section className="receipt mx-4 mt-8 bg-surface px-7 pb-11 pt-7 lg:mx-0 lg:mr-4 lg:mt-0 lg:w-full lg:max-w-[400px] lg:justify-self-end" aria-labelledby="receipt-title">
      <div className="pb-4 text-center">
        <h2 id="receipt-title" className="text-[15px] font-semibold">정리하면 이렇게 보여요</h2>
        <p className="num text-xs text-muted">예시 · 이번 달 구독 {EXAMPLE.length}개</p>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.date} className="flex min-h-[42px] items-center gap-2.5 border-b border-dashed border-[#dfe2e6]">
            <span className="min-w-0 truncate">{row.short}</span>
            <span className={`shrink-0 text-xs ${row.usage === "rarely" ? "font-semibold text-ink" : "text-muted"}`}>{USAGE_WORD[row.usage]}</span>
            <span className="num ml-auto shrink-0">{won(row.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between pt-[18px]">
        <span>매달 합계</span>
        <strong className="num text-[22px]">{won(EXAMPLE_TOTAL)}</strong>
      </div>
      <div className="mt-[18px] border-t-2 border-ink pt-[18px]">
        <p className="text-[13px] text-muted">거의 안 쓰는 구독에 매달</p>
        <p className="num mt-1 text-[32px] font-bold leading-tight tracking-[-0.02em] text-hue">{won(EXAMPLE_RARELY)}</p>
        <p className="num text-[13px] text-muted">1년이면 {won(EXAMPLE_RARELY * 12)}</p>
      </div>
    </section>
  );
}
