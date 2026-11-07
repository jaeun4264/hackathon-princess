/** 이 기기 시간대의 오늘 'YYYY-MM-DD' (확인일 30일 계산·제안 만들기에 써요). */
export function todayString(now: Date = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
