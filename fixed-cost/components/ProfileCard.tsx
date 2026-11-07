"use client";
import { useState } from "react";
import { SCHOOL_OPTIONS, STATUS_OPTIONS, toSchoolEmail, type SchoolEmailAnswer } from "@/lib/client/confirm";
import type { UserProfile } from "@/lib/types";

const selectClass = "h-12 w-full appearance-none rounded-[10px] border border-control bg-surface bg-[length:12px] bg-[right_14px_center] bg-no-repeat px-3 pr-9 text-base outline-none focus:border-accent";
// 선택 상자 화살표 (단색 SVG)
const chevron = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%235c6064' stroke-width='1.5'/%3E%3C/svg%3E\")" };

const EMAIL_OPTIONS: { value: SchoolEmailAnswer; label: string }[] = [
  { value: "yes", label: "예" },
  { value: "no", label: "아니오" },
  { value: "unknown", label: "모르겠어요" },
];

/** 학교·재학 상태·학교 이메일. 셋 다 고르면 store의 profile을 채워요. 혜택 판정(T2)에 쓰여요. */
export function ProfileCard({ profile, onChange }: { profile: UserProfile | null; onChange: (profile: UserProfile) => void }) {
  const [school, setSchool] = useState(profile?.school ?? "");
  const [status, setStatus] = useState<UserProfile["status"] | "">(profile?.status ?? "");
  // 저장된 false는 "아니오"와 "모르겠어요"를 구분할 수 없어서 안전하게 "모르겠어요"로 보여 줘요.
  const [email, setEmail] = useState<SchoolEmailAnswer | null>(profile ? (profile.school_email ? "yes" : "unknown") : null);

  function update(next: { school?: string; status?: UserProfile["status"] | ""; email?: SchoolEmailAnswer | null }) {
    const s = next.school ?? school;
    const st = next.status ?? status;
    const e = next.email !== undefined ? next.email : email;
    if (s && st && e) onChange({ school: s, status: st, school_email: toSchoolEmail(e) });
  }

  return (
    <section className="rounded-[20px] bg-surface p-5" aria-labelledby="profile-title">
      <h2 id="profile-title" className="text-base font-semibold">학생 혜택을 찾으려면</h2>
      <p className="mt-0.5 text-sm text-muted">학교와 재학 상태만 써요. 이름이나 학번은 받지 않아요.</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="profile-school" className="mb-2 block text-sm font-medium">학교</label>
          <select id="profile-school" className={selectClass} style={chevron} value={school} onChange={(event) => { setSchool(event.target.value); update({ school: event.target.value }); }}>
            <option value="" disabled>고르기</option>
            {SCHOOL_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="profile-status" className="mb-2 block text-sm font-medium">재학 상태</label>
          <select id="profile-status" className={selectClass} style={chevron} value={status} onChange={(event) => { const value = event.target.value as UserProfile["status"]; setStatus(value); update({ status: value }); }}>
            <option value="" disabled>고르기</option>
            {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 block text-sm font-medium">학교 이메일로 인증할 수 있나요?</legend>
        <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-ground p-1">
          {EMAIL_OPTIONS.map((option) => (
            <label key={option.value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-[8px] text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${email === option.value ? "bg-surface font-semibold" : "text-muted"}`}>
              <input type="radio" name="profile-email" value={option.value} checked={email === option.value} onChange={() => { setEmail(option.value); update({ email: option.value }); }} className="sr-only" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
