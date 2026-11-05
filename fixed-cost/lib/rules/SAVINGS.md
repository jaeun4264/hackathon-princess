# B6 구독 비용과 절약액

`lib/rules/index.ts`에서 summarize, isStale, buildSuggestions, makePauseSuggestion, fillPlaceholders를 내보내요. 네트워크·AI·시계 읽기 없이 입력과 today로만 계산하며 B1 타입·스키마와 기존 B2 monthlyEquivalent를 재사용해요.

- 지출은 결제 amount를 월 환산해 합산해요. 연간은 Math.round(amount / 12), 연 절약액은 월 절약액 × 12예요. 따라서 50,500원 연간 결제는 월 4,208원, 연 추정 절약액 50,496원이에요. 전달받은 monthly_amount는 다시 계산해요.
- usage=null, 금액 누락·음수·소수, 중복 구독 ID 등 잘못된 입력은 에러예요. summarize는 서비스가 미확정이어도 실제 관측 지출을 합산해요. 카탈로그 가격 null과 관측 결제 금액은 별개예요.
- buildSuggestions는 등록 서비스 ID가 있고 needs_check=false이며 catalog 매칭 또는 사용자 확인(user_confirmed=true)이 있는 구독만 사용해요. B5의 기존 service_id는 confirmed_service_id 투영값이에요. suggested_service_id는 소비하지 않아요. B5 상세 결과에서 Subscription을 구성할 때 confirmed_service_id를 사용해야 하며 후보 ID를 복사하면 안 돼요. B3→B2→B5→B6 통합 테스트로 확인해요.
- rarely는 cancel, often은 검증된 eligible=yes 혜택의 양의 차액 또는 keep(0원), sometimes는 자동 해지하지 않아요. 같은 용도라는 이유로 해지하지 않아요. pause는 사용자의 별도 선택 후 makePauseSuggestion으로만 만들어요. 이 함수의 기존 계약에는 catalog 인자가 없어 카탈로그 참조와 해지 URL을 검증·조회할 수 없어요. 호출자는 등록된 확인 구독만 전달해야 하며 URL·확인일은 null, stale=true로 반환해요.
- 혜택은 같은 id·출처·확인일의 validation=ok, 조건 원문 인용, 추가 정보 불필요인 yes만 사용해요. 가격 null·불명확·음수 차액·0원 차액은 할인 제안에서 제외해요. 원문 인용 확인은 방어적 검사이며 B7 자격 판정 API는 구현하지 않아요.
- 여러 할인은 같은 원래 금액에 겹쳐 적용하지 않아요. 구독별로 절약액이 가장 큰 대안 하나만 선택하고 동일 혜택 중복 판정은 한 번만 사용해요. 모순되는 판정은 제외해요. 별도 구독 ID가 실제로 같은 결제인지는 입력 단계의 책임이에요.
- 30일은 최신, 31일·확인일 없음·미래일은 재확인 대상이에요. 오래된 제안도 stale=true로 유지해요. 제안은 월 절약액 내림차순이며 제휴 우대는 없어요.

실제 카탈로그의 혜택·묶음이 현재 비어 있으므로 할인 가격을 추가하지 않았어요. 테스트의 혜택은 전부 MOCK이며 실제 제공 조건이 아니에요. 대체 묶음의 월 2,100원·7,000원 예시는 BACKEND_PROMPTS B11의 compareBundles 범위이므로 이번 B6에는 포함하지 않아요. 사용자 확인 UI·저장, B7 이후 API도 구현하지 않아요.

재현: `node node_modules/tsx/dist/cli.mjs tests/examples/savings.ts`. tests/suggestions.test.ts에 필수 24,100원 사례, 연 환산, 가격 누락, 중복 할인, 미확정, 오래된 확인일과 통합 검증이 있어요. 실제 API·Syntitan·환경 파일을 사용하지 않아요.
