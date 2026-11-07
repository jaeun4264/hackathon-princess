// 앱 상태 (FRONTEND.md 4부 2절). 결제 내역은 이 브라우저의 localStorage에만 저장해요.
// localStorage가 막혀 있어도(사생활 보호 모드 등) 메모리로 계속 동작해요.
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { loadCatalog } from "../catalog";
import { buildSuggestions } from "../rules";
import type { BenefitResult, Subscription, Suggestion, Transaction, Usage, UserProfile } from "../types";

export type Phase = "empty" | "interpreting" | "confirming" | "ready";
export type ActionStatus = Suggestion["action_status"];
export type KeepReason = NonNullable<Suggestion["keep_reason"]>;

export interface AppData {
  profile: UserProfile | null;
  transactions: Transaction[];
  subscriptions: Subscription[];
  benefitResults: BenefitResult[];
  suggestions: Suggestion[];
  /** 구독 id → AI·별칭이 추정한 후보 서비스 id (B5 resolutions). 사용자가 확인하기 전에는 service_id에 넣지 않아요. */
  suggestedServiceIds: Record<string, string | null>;
  sessionId: string;
  phase: Phase;
  /** 홈에 처음 들어왔을 때 discovery 집계를 한 번만 보내려고 기록해요. */
  discoverySent: boolean;
}

export type AnalysisStatus = "idle" | "running" | "done";

export interface AppState extends AppData {
  /** 혜택 판정·제안 문장 만들기 진행 상태 (저장하지 않아요) */
  analysisStatus: AnalysisStatus;
  analysisDegraded: boolean;
  setAnalysis: (status: AnalysisStatus, degraded?: boolean) => void;
  markDiscoverySent: () => void;
  setProfile: (profile: UserProfile) => void;
  /** 새 결제 내역으로 바꾸고 이전 분석 결과는 비워요. */
  loadTransactions: (transactions: Transaction[]) => void;
  setPhase: (phase: Phase) => void;
  setSubscriptions: (subscriptions: Subscription[], suggestedServiceIds?: Record<string, string | null>) => void;
  addSubscription: (subscription: Subscription) => void;
  updateSubscription: (id: string, patch: Partial<Omit<Subscription, "id">>) => void;
  removeSubscription: (id: string) => void;
  setUsage: (id: string, usage: Usage) => void;
  /** S1 "다음": 모든 구독에 사용 정도가 있어야 성공해요. */
  confirmAll: () => boolean;
  setBenefitResults: (results: BenefitResult[]) => void;
  mergeBenefitResults: (results: BenefitResult[]) => void;
  /** 규칙(buildSuggestions)으로 제안을 다시 만들어요. 이미 체크한 실행 상태와 받은 문장은 유지해요. */
  rebuildSuggestions: (today: string) => void;
  setSuggestions: (suggestions: Suggestion[]) => void;
  addSuggestion: (suggestion: Suggestion) => void;
  setSuggestionMessage: (id: string, message: string, source: Suggestion["message_source"]) => void;
  setAction: (id: string, status: ActionStatus, keepReason?: KeepReason | null) => void;
  resetAll: () => void;
  // runInterpret(F2), runBenefits(F4)는 네트워크를 쓰므로 lib/client/pipeline.ts에 둬요.
}

export const STORE_KEY = "fixed-cost:v1";

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // 아래 대체 방식으로
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function initialData(sessionId: string = randomId()): AppData {
  return { profile: null, transactions: [], subscriptions: [], benefitResults: [], suggestions: [], suggestedServiceIds: {}, sessionId, phase: "empty", discoverySent: false };
}

/** localStorage를 감싸 모든 접근을 try/catch. 실패하면 메모리 저장소로 넘어가요. */
export function createSafeStorage(getStorage: () => Storage | undefined = () => globalThis.localStorage): StateStorage {
  const memory = new Map<string, string>();
  const storage = (): Storage | undefined => {
    try {
      return getStorage();
    } catch {
      return undefined;
    }
  };
  return {
    getItem(name) {
      try {
        const value = storage()?.getItem(name);
        if (value !== undefined && value !== null) return value;
      } catch {
        // 메모리로
      }
      return memory.get(name) ?? null;
    },
    setItem(name, value) {
      memory.set(name, value);
      try {
        storage()?.setItem(name, value);
      } catch {
        // 메모리에만 남겨요
      }
    },
    removeItem(name) {
      memory.delete(name);
      try {
        storage()?.removeItem(name);
      } catch {
        // 무시
      }
    },
  };
}

export function createAppStore(storage: StateStorage = createSafeStorage()) {
  return create<AppState>()(
    persist(
      (set, get) => ({
        ...initialData(),
        analysisStatus: "idle",
        analysisDegraded: false,

        setAnalysis: (analysisStatus, degraded) =>
          set(degraded === undefined ? { analysisStatus } : { analysisStatus, analysisDegraded: degraded }),

        markDiscoverySent: () => set({ discoverySent: true }),

        setProfile: (profile) => set({ profile }),

        loadTransactions: (transactions) =>
          set({ transactions, subscriptions: [], benefitResults: [], suggestions: [], suggestedServiceIds: {}, phase: "empty" }),

        setPhase: (phase) => set({ phase }),

        setSubscriptions: (subscriptions, suggestedServiceIds = {}) => set({ subscriptions, suggestedServiceIds }),

        addSubscription: (subscription) => set({ subscriptions: [...get().subscriptions, subscription] }),

        updateSubscription: (id, patch) =>
          set({ subscriptions: get().subscriptions.map((sub) => (sub.id === id ? { ...sub, ...patch, id } : sub)) }),

        removeSubscription: (id) =>
          set({
            subscriptions: get().subscriptions.filter((sub) => sub.id !== id),
            suggestions: get().suggestions.filter((entry) => !entry.subscription_ids.includes(id)),
          }),

        setUsage: (id, usage) =>
          set({ subscriptions: get().subscriptions.map((sub) => (sub.id === id ? { ...sub, usage } : sub)) }),

        confirmAll: () => {
          const { subscriptions } = get();
          if (subscriptions.length === 0 || subscriptions.some((sub) => sub.usage === null)) return false;
          set({ phase: "ready" });
          return true;
        },

        setBenefitResults: (benefitResults) => set({ benefitResults }),

        mergeBenefitResults: (results) => {
          const key = (entry: BenefitResult) => `${entry.kind}:${entry.id}`;
          const incoming = new Set(results.map(key));
          set({ benefitResults: [...get().benefitResults.filter((entry) => !incoming.has(key(entry))), ...results] });
        },

        rebuildSuggestions: (today) => {
          const previous = new Map(get().suggestions.map((entry) => [entry.id, entry]));
          let next: Suggestion[];
          try {
            next = buildSuggestions({ subs: get().subscriptions, benefitResults: get().benefitResults, catalog: loadCatalog(), today });
          } catch {
            // 규칙이 입력을 거부하면(예: 확인 안 된 구독) 제안 없이 계속 진행해요.
            next = [];
          }
          const pauses = get().suggestions.filter((entry) => entry.type === "pause");
          const merged = next.map((entry) => {
            const old = previous.get(entry.id);
            return old
              ? { ...entry, action_status: old.action_status, keep_reason: old.keep_reason,
                  ...(old.message_source === "ai" ? { message: old.message, message_source: old.message_source } : {}) }
              : entry;
          });
          set({ suggestions: [...merged, ...pauses.filter((entry) => !merged.some((m) => m.id === entry.id))] });
        },

        setSuggestions: (suggestions) => set({ suggestions }),

        addSuggestion: (suggestion) =>
          set({ suggestions: [...get().suggestions.filter((entry) => entry.id !== suggestion.id), suggestion] }),

        setSuggestionMessage: (id, message, source) =>
          set({ suggestions: get().suggestions.map((entry) => (entry.id === id ? { ...entry, message, message_source: source } : entry)) }),

        setAction: (id, status, keepReason = null) =>
          set({
            suggestions: get().suggestions.map((entry) =>
              entry.id === id ? { ...entry, action_status: status, keep_reason: status === "kept" ? keepReason : null } : entry),
          }),

        // "내 데이터 지우기". sessionId도 새로 만들어 이전 집계와 연결되지 않게 해요.
        resetAll: () => set({ ...initialData(), analysisStatus: "idle", analysisDegraded: false }),
      }),
      {
        name: STORE_KEY,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state): AppData => ({
          profile: state.profile,
          transactions: state.transactions,
          subscriptions: state.subscriptions,
          benefitResults: state.benefitResults,
          suggestions: state.suggestions,
          suggestedServiceIds: state.suggestedServiceIds,
          sessionId: state.sessionId,
          discoverySent: state.discoverySent,
          // 해석 도중 새로 고침하면 다시 시작할 수 있게 interpreting은 저장하지 않아요.
          phase: state.phase === "interpreting" ? "empty" : state.phase,
        }),
      },
    ),
  );
}

export const useAppStore = createAppStore();
