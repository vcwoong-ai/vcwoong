# 🚀 DealSync 빠른 시작 가이드

## 5분 안에 개발 시작하기

### 1. 사전 준비 (10분)

```bash
# Node.js 20+ 확인
node --version

# Claude Code 설치 (Pro 구독 필요 - 월 $20)
npm install -g @anthropic-ai/claude-code

# 작업 폴더 만들기
mkdir ~/dealsync && cd ~/dealsync
```

### 2. 계정 만들기 (각 5분)

| 서비스 | 용도 | 가격 | 링크 |
|---|---|---|---|
| Anthropic API | Claude API 호출 | $5 크레딧 무료 | https://console.anthropic.com |
| Supabase | DB + 인증 + 스토리지 | 무료 (500MB) | https://supabase.com |
| Vercel | 배포 | 무료 (취미용) | https://vercel.com |
| GitHub | 코드 저장소 | 무료 | https://github.com |
| Toss Payments | 결제 (나중에) | 가입 무료 | https://toss.im/business |

### 3. 환경 변수 준비

`.env.local` 파일을 만들고 다음 값을 채워두세요:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Claude Code 시작

```bash
cd ~/dealsync
claude
```

### 5. Phase 1부터 순서대로 실행

```
Step 1: 01-setup.md 내용 전체 복사
Step 2: Claude Code 채팅창에 붙여넣기 + Enter
Step 3: Claude가 작업 완료할 때까지 기다림
Step 4: 결과 확인 후 git commit
Step 5: /clear (컨텍스트 초기화)
Step 6: 02-database.md로 반복
... 총 6번 반복
```

---

## ⏱️ 예상 소요 시간

| Phase | 작업 내용 | Claude Code 작업 시간 | 사용자 확인 시간 |
|---|---|---|---|
| 1 | 프로젝트 셋업 | 30분 | 10분 |
| 2 | DB + 인증 | 60분 | 20분 |
| 3 | 파싱 + 코어 엔진 | 90분 | 30분 |
| 4 | BIO 에이전트 | 90분 | 30분 |
| 5 | 양식 재현 엔진 | 120분 | 40분 |
| 6 | UI + 배포 | 90분 | 60분 |
| **총** | **MVP 완성** | **약 8시간** | **약 3시간** |

**현실적 일정:** 하루 2~3시간씩 5일이면 MVP 출시 가능

---

## 🎯 마일스톤

### Day 1-2: 기초 구축
- Phase 1 + 2 완료
- 로그인 가능한 빈 대시보드

### Day 3-4: 코어 엔진
- Phase 3 + 4 완료
- BIO 분석 기능 동작

### Day 5: 양식 + 출시
- Phase 5 + 6 완료
- Vercel 배포 완료

### Week 2: 베타 테스트
- W님 VC 네트워크 5명 모집
- 무료로 사용하게 하고 피드백 수집
- 정부지원 사업계획서 작성 (Phase 7)

### Week 3-4: 유료 전환
- 베타 사용자 중 3명 유료 전환
- 첫 MRR 달성

---

## ⚠️ 주의사항

### Claude Code 사용 시
- **컨텍스트 한도:** Pro 플랜은 주간 토큰 한도 있음. 복잡한 작업은 분할 실행.
- **/clear 활용:** 각 Phase 끝나면 반드시 `/clear`로 컨텍스트 초기화
- **/rewind 활용:** 결과 마음에 안 들면 되돌리기
- **에러 발생 시:** 에러 메시지 그대로 붙여넣으면 Claude가 해결

### API 비용 관리
- Claude Sonnet 4.6 가격: 입력 $3/1M token, 출력 $15/1M token
- 보고서 1건 생성: 약 $0.05~0.10 (50~100원)
- 월 100건 처리 = 약 5,000~10,000원
- Anthropic 콘솔에서 사용량 한도 설정 권장

### 데이터 보안
- IR 자료는 민감 정보 → Supabase RLS 정책 철저히
- 베타 사용자에게 NDA 또는 사용 약관 동의 받기
- API 키는 절대 GitHub에 커밋 X (.env.local 사용)

---

## 🆘 문제 해결

### "Claude Code가 멈춘 것 같아요"
→ `Esc Esc`로 중단 후 다시 시도

### "빌드 에러 발생"
→ 에러 메시지 전체를 그대로 Claude Code에 붙여넣기

### "원하는 결과가 안 나와요"
→ `/rewind`로 되돌린 후 더 구체적인 지시로 재요청

### "토큰 한도 초과"
→ 다음 주까지 기다리거나 Max 플랜 업그레이드 ($100/월)

### "Supabase 마이그레이션 실패"
→ Supabase 대시보드의 SQL Editor에서 직접 SQL 실행

---

## 📞 추가 도움 필요할 때

각 Phase 진행 중 막힌 부분이 있으면 다음 정보와 함께 질문하세요:
1. 어떤 Phase 진행 중인지
2. 정확한 에러 메시지
3. 시도해본 것들
4. 현재 코드 (관련 부분만)

화이팅! 🚀
