# PR #8 → main 머지 체크리스트

## 브랜치

- **소스:** `cursor/feature-improvements-6974` (PR #8)
- **타겟:** `main`

## 머지 전 확인 (완료)

- [x] `npm run build` 성공
- [x] main 대비 충돌 없음 (fast-forward 가능)
- [x] 6개 섹터 AI 에이전트 + LP 리포팅
- [x] Dr. Cell 외부 데이터 (PubMed, ClinicalTrials, FDA) + rNPV 부록
- [x] Code/Neuron/Vault 심층 분석 엔진 연동
- [x] 양식 재현, Kanban, 마법사, 대시보드
- [x] 사용량 쿼터, SEO, 에러 바운더리

## 머지 후 수동 작업 (별도)

- [ ] Vercel 프로덕션 배포
- [ ] Toss Payments 결제 연동
- [ ] PostgreSQL 프로덕션 DB 마이그레이션

## 로컬 머지 명령

```bash
git checkout main
git pull origin main
git merge cursor/feature-improvements-6974
npm run build
git push origin main
```

## 데모 계정

- Email: `demo@dealsync.kr`
- Password: `Demo1234!`
