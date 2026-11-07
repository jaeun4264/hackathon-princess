"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { listSamples, sampleAdapter } from "@/lib/adapters/sample";
import { parseCsv } from "@/lib/adapters/csv";
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
import { UsageChip } from "./UsageChip";

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

// 첫 화면 예시. 금액은 카탈로그에 확인된 가격만 써요. 합계는 이 줄들에서 계산해요.
const EXAMPLE: { name: string; amount: number; usage: Usage }[] = [
  { name: "다글로", amount: 14900, usage: "often" },
  { name: "넷플릭스", amount: 13500, usage: "rarely" },
  { name: "이모티콘 플러스", amount: 6900, usage: "sometimes" },
  { name: "아이클라우드", amount: 1100, usage: "rarely" },
];
const EXAMPLE_RARELY = EXAMPLE.filter((row) => row.usage === "rarely").reduce((sum, row) => sum + row.amount, 0);

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
  degraded: boolean;
  gmail?: { mailCount: number; foreign: number; noAmount: number };
  csvSkipped?: { line: number; reason: string }[];
};
type Failure = { title: string; detail: string };

const primaryButton = "flex min-h-13 w-full items-center justify-center rounded-[10px] bg-primary px-5 text-base font-semibold text-primary-fg transition-transform active:scale-[0.98]";
const secondaryButton = "flex min-h-13 w-full items-center justify-center rounded-[10px] border border-control bg-surface px-5 text-base font-semibold transition-transform hover:bg-rule active:scale-[0.98]";

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
    const next: Report = { source, found: result.subscriptions.length, degraded: result.degraded, ...extra };
    const skippedMail = next.gmail ? next.gmail.foreign + next.gmail.noAmount : 0;
    // 알려 줄 게 있으면 이 화면에서 요약을 보여 주고, 없으면 바로 구독 확인으로 가요.
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
        setFailure({ title: "영수증 메일을 찾지 못했어요", detail: "최근 6개월에 원화 영수증이 없어요. 영수증이 없는 구독은 직접 추가해 주세요." });
        return;
      }
      setBusy("결제 정리 중");
      await analyze(result.transactions, "gmail", { gmail: { mailCount: result.mailCount, foreign: skipped.foreign, noAmount: skipped.noAmount } });
    } catch (error) {
      setBusy(null);
      const code = error instanceof GmailImportError ? error.code : "network";
      setFailure(
        code === "denied"
          ? { title: "Gmail 권한을 허용해야 불러올 수 있어요", detail: "다시 시도하거나, 샘플로 체험하거나, 구독을 직접 추가할 수 있어요." }
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
        setReport({ source: "csv", found: 0, degraded: false, csvSkipped: skipped });
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
    <main className="flex flex-1 flex-col pb-8">
      <AppBar />
      <PrivacyNotice />

      <section className="px-4 pt-7">
        <h1 className="text-[28px] font-semibold leading-[1.25] tracking-[-0.02em]">
          매달 나가는 구독을
          <br />
          한 번에 정리해요
        </h1>
        <p className="mt-3 text-base leading-6 text-muted">
          결제 내역을 넣으면 거의 안 쓰는 구독과 받을 수 있는 학생 혜택을 찾아, 아낄 수 있는 금액을 보여 드려요.
        </p>
      </section>

      {showExisting ? (
        <section className="mx-4 mt-4 flex items-center gap-3 rounded-[20px] bg-surface p-5">
          <p className="flex-1 text-base">
            정리하던 구독 <span className="num font-semibold">{existing.length}개</span>가 있어요.
          </p>
          <Link href={needsUsage ? "/confirm" : "/home"} className="flex min-h-11 items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-fg">
            이어서 보기
          </Link>
        </section>
      ) : null}

      {failure ? (
        <section className="mx-4 mt-4 rounded-[20px] bg-surface p-5" role="alert">
          <p className="text-base font-semibold text-negative">{failure.title}</p>
          <p className="mt-1 text-sm text-ink">{failure.detail}</p>
        </section>
      ) : null}

      <section className="mt-6 px-4" aria-label="결제 내역 넣기">
        {busy ? (
          <div className="flex min-h-[188px] flex-col items-center justify-center rounded-[20px] bg-surface p-5 text-center" role="status" aria-live="polite">
            <span aria-hidden="true" className="mb-4 size-7 animate-spin rounded-full border-[3px] border-rule border-t-accent motion-reduce:animate-none" />
            <p className="text-base font-semibold">{busy}</p>
            <p className="mt-1 text-sm text-muted">결제 내역은 이 기기에서만 정리해요.</p>
          </div>
        ) : report ? (
          <ReportPanel report={report} onManual={() => setManualOpen(true)} onRetry={() => setReport(null)} />
        ) : (
          <div className="flex flex-col gap-3">
            <InputMethodPicker onSelect={onMethod} part="primary" />
            <button type="button" onClick={() => setSampleOpen(true)} className={secondaryButton}>
              샘플 데이터로 체험
            </button>
            <div className="flex flex-wrap items-center justify-center gap-x-4">
              <button type="button" onClick={() => setManualOpen(true)} className="min-h-11 px-2 text-sm font-semibold underline underline-offset-4">
                구독 직접 추가
              </button>
              <InputMethodPicker onSelect={onMethod} part="rest" />
            </div>
          </div>
        )}
      </section>

      {showExisting ? (
        <button type="button" onClick={resetAll} className="mt-4 min-h-11 self-center px-3 text-sm text-negative underline underline-offset-4">
          내 데이터 지우기
        </button>
      ) : null}

      {/* 예시: 정리하면 이렇게 보여요. 합계는 이 카드 안에 둬요. */}
      <figure className="mx-4 mt-8 rounded-[20px] bg-surface p-5" aria-labelledby="example-caption">
        <figcaption id="example-caption" className="text-sm text-muted">정리하면 이렇게 보여요 (예시)</figcaption>
        <ul className="mt-2">
          {EXAMPLE.map((row) => (
            <li key={row.name} className="flex min-h-12 items-center gap-3 border-b border-rule last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-base">{row.name}</span>
              <UsageChip usage={row.usage} />
              <span className="num w-[84px] text-right text-base">{won(row.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-[10px] bg-rarely-bg px-4 py-3 text-rarely-ink">
          <p className="text-sm">거의 안 쓰는 구독에 매달</p>
          <p className="num mt-0.5 text-[28px] font-semibold leading-tight">{won(EXAMPLE_RARELY)}</p>
          <p className="num text-sm">1년이면 {won(EXAMPLE_RARELY * 12)}</p>
        </div>
      </figure>

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

        {report.gmail ? (
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>영수증 메일 <span className="num">{report.gmail.mailCount}</span>통을 읽었어요.</li>
            {report.gmail.foreign > 0 ? <li>외화 영수증 <span className="num">{report.gmail.foreign}</span>통은 금액을 직접 넣어 주세요.</li> : null}
            {report.gmail.noAmount > 0 ? <li>금액을 읽지 못한 메일이 <span className="num">{report.gmail.noAmount}</span>통 있어요.</li> : null}
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
