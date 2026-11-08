// ---------- 기본 ----------
export type Interval = 'monthly' | 'yearly';
export type Usage = 'often' | 'sometimes' | 'rarely'; // 자주 / 가끔 / 거의 안 씀
export const USAGE_LABEL: Record<Usage, string> = {
  often: '자주',
  sometimes: '가끔',
  rarely: '거의 안 씀',
};

// ---------- 입력 ----------
// 브라우저가 Gmail에서 읽은 메일을 줄인 모양. 이 객체는 브라우저 밖(서버·AI)으로 보내지 않는다.
export interface GmailMessageLite {
  id: string;                // Gmail 메시지 id (중복 제거용)
  received_at: string;       // 수신 시각 ISO 문자열 (internalDate를 변환)
  from_name: string;         // 발신자 표시 이름 (예: 'Netflix')
  from_domain: string;       // 발신 주소의 도메인 (예: 'netflix.com')
  subject: string;
  text: string;              // 본문을 일반 텍스트로 (HTML이면 태그 제거). 최대 20,000자
}

export interface GmailParseResult {
  transactions: Transaction[];
  skipped: { message_id: string; reason: 'no_amount' | 'foreign_currency' | 'not_receipt' | 'duplicate' }[];
}

export interface Transaction {
  id: string;
  date: string;              // 'YYYY-MM-DD'
  amount: number;            // 원, 정수
  currency: 'KRW';
  raw_name: string;          // 영수증 발신자·명세서에 찍힌 표기 그대로 (예: '카카오페이')
  payment_method: string;    // 예: 'kakaopay', 'apple', 'card'
  source: 'sample' | 'csv' | 'gmail' | 'manual';
  // 외화 영수증을 환율로 환산했을 때만 있어요 (세 필드가 함께). amount는 환산한 원화(추정)이고 카드 청구액과 다를 수 있어요.
  original_currency?: 'USD' | 'EUR' | 'JPY' | 'GBP';
  original_amount?: number;  // 영수증의 원래 금액 (예: 20.00)
  fx_date?: string;          // 환산에 쓴 환율 기준일 'YYYY-MM-DD'
}

export interface UserProfile {
  school: string;            // 예: '고려대학교'
  status: '재학' | '휴학' | '대학원' | '졸업예정' | '기타';
  school_email: boolean;     // 학교 이메일 인증 가능 여부
  grade?: number;
  age_18_plus?: boolean;     // 만 18세 이상이라고 본인이 답했는지. 생년월일·나이는 받지 않아요. 없으면 모름
}

// ---------- 구독 ----------
export interface Subscription {
  id: string;
  service_id: string | null;       // 카탈로그 id. 모르면 null
  display_name: string;
  category: string;
  raw_name: string;
  amount: number;                  // 1회 결제 금액 (원)
  interval: Interval;
  monthly_amount: number;          // 월 환산 (원). yearly는 Math.round(amount / 12). 코드가 계산
  next_date: string | null;
  usage: Usage | null;             // S1에서 사용자가 탭. 이게 null이면 S1을 못 넘어감
  confidence: number;              // 0~1
  interpret_source: 'catalog' | 'ai' | 'user' | 'unknown';
  needs_check: boolean;            // true면 화면에 '확인 필요' 표시
  user_confirmed: boolean;
  evidence_transaction_ids: string[];
}

export interface SubscriptionCandidate {   // F2 출력 (아직 해석 전)
  key: string;
  raw_name: string;
  amount: number;
  interval: Interval;
  payment_method: string;
  transaction_ids: string[];
  next_date: string | null;
}

// ---------- 카탈로그 (data/catalog/*.json) ----------
export interface ServicePlan {
  id: string;
  name: string;
  price: number | null;      // 모르면 null. 지어내지 않는다
  interval: Interval;
}
export interface CatalogService {
  id: string;
  name: string;
  category: string;
  aliases: string[];         // 명세서·영수증에 찍히는 이름들
  email_domains: string[];   // 영수증 메일 발신 도메인 (예: 'netflix.com'). 사람이 실제 메일로 확인해 채움, 모르면 []
  plans: ServicePlan[];
  cancel_url: string | null;
  checked_at: string | null; // 'YYYY-MM-DD'
}
export interface CatalogBenefit {
  id: string;
  service_id: string;
  kind: 'student_discount' | 'school_license';
  school: string | null;     // school_license면 학교명
  conditions: string;        // 공식 페이지의 조건 원문. 요약·번역 금지
  benefit_text: string;
  price_after_monthly: number | null; // 혜택 적용 후 월 금액. 무료면 0, 모르면 null
  source_url: string;
  checked_at: string;
}
export interface CatalogBundle {
  id: string;
  name: string;
  includes: { service_id: string; plan_id: string }[];
  price_monthly: number | null;
  member_of: string | null;               // 이 service_id 멤버십이 이미 있으면 가격이 달라짐 (예: 'naver_plus')
  price_monthly_if_member: number | null;
  conditions: string;                     // 조건 원문 ('1인 계정만' 등)
  is_partner: boolean;                    // true면 화면에 '제휴' 표시
  source_url: string;
  checked_at: string;
}

// ---------- API 결과 타입 (3절의 results 한 줄) ----------
export interface InterpretResult {
  key: string;
  service_id: string | null;
  category: string;
  confidence: number;
  reason: string;
  source: 'catalog' | 'ai' | 'unknown';
  needs_check: boolean;
}
export interface BenefitResult {
  kind: 'benefit' | 'bundle';
  id: string;
  eligible: 'yes' | 'no' | 'unknown';
  quoted_conditions: string[];
  missing_info: ('school' | 'status' | 'school_email' | 'grade' | 'age' | 'other')[];
  reason: string;
  source_url: string;
  checked_at: string;
  stale: boolean;
  validation: 'ok' | 'quote_failed' | 'ai_error';
}
export interface Catalog {
  services: CatalogService[];
  benefits: CatalogBenefit[];
  bundles: CatalogBundle[];
}

// ---------- 제안 ----------
export type SuggestionType =
  | 'cancel' | 'pause' | 'student_discount' | 'school_license' | 'bundle' | 'keep';

export interface Suggestion {
  id: string;
  type: SuggestionType;
  subscription_ids: string[];
  saving_monthly: number;          // 코드가 계산. 'keep'이면 0
  saving_yearly: number;           // saving_monthly * 12
  message: string;                 // T3 문장 또는 기본 문장
  message_source: 'ai' | 'fallback';
  source_url: string | null;
  checked_at: string | null;
  stale: boolean;                  // checked_at이 30일 넘으면 true → '재확인 필요'
  is_partner: boolean;
  cancel_url: string | null;
  action_status: 'none' | 'done' | 'changed' | 'kept';
  keep_reason: 'maybe_later' | 'heavy_use' | 'other' | null;
}
