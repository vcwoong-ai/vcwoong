# Phase 2: 데이터베이스 + 인증

다음 내용을 Claude Code 새 세션에 그대로 붙여넣으세요.

---

DealSync 프로젝트의 Phase 2를 진행합니다.
Phase 1에서 만든 프로젝트 구조 위에 Supabase 연동과 DB 스키마를 구현합니다.

## 작업 목표

1. Supabase 클라이언트 설정 (서버/클라이언트)
2. DB 스키마 SQL 작성
3. Row Level Security (RLS) 정책
4. 인증 페이지 (로그인/회원가입)
5. 미들웨어 인증 보호

## 1. Supabase 클라이언트 설정

`/lib/supabase/client.ts` - 브라우저용 클라이언트
`/lib/supabase/server.ts` - 서버 컴포넌트용 클라이언트  
`/lib/supabase/middleware.ts` - 미들웨어용 세션 갱신

@supabase/ssr 패키지 사용. Next.js 14 App Router 공식 패턴 따르기.

## 2. DB 스키마 작성

`/supabase/migrations/0001_initial_schema.sql` 파일 생성:

```sql
-- 1. 사용자 프로필 (auth.users 확장)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  vc_company_name TEXT,           -- 소속 VC사 이름
  role TEXT DEFAULT 'analyst',    -- 'analyst'|'partner'|'admin'
  subscription_plan TEXT DEFAULT 'free',  -- 'free'|'solo'|'sector_pro'|'multi'|'full'|'bio_premium'
  active_sectors TEXT[] DEFAULT ARRAY[]::TEXT[],  -- 활성화된 섹터들
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. VC 회사 (템플릿 소유자)
CREATE TABLE vc_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,             -- 브랜드 색상
  secondary_color TEXT,
  font_family TEXT DEFAULT '맑은 고딕',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 보고서 템플릿
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vc_company_id UUID REFERENCES vc_companies(id) NOT NULL,
  name TEXT NOT NULL,
  report_type TEXT,               -- 'initial'|'followon'|'exit'|'lp_report'
  file_format TEXT NOT NULL,      -- 'pptx'|'docx'
  sections JSONB NOT NULL,        -- 섹션 구조 (아래 상세)
  design_config JSONB,            -- 디자인 토큰
  slide_structure JSONB,          -- PPT의 경우 슬라이드별 placeholder 위치
  original_file_url TEXT,         -- 원본 양식 파일
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 스타트업 (분석 대상)
CREATE TABLE startups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  company_name TEXT NOT NULL,
  primary_sector TEXT,            -- 'bio'|'it_saas'|'ai_deeptech'|'manufacturing'|'content'|'fintech'
  secondary_sectors TEXT[],       -- 융합 산업
  stage TEXT,                     -- 'pre_seed'|'seed'|'series_a' 등
  extracted_data JSONB,           -- AI 파싱 결과
  raw_files JSONB,                -- 업로드 파일 메타
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 생성된 보고서
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  startup_id UUID REFERENCES startups(id) NOT NULL,
  template_id UUID REFERENCES templates(id) NOT NULL,
  status TEXT DEFAULT 'processing',  -- 'processing'|'completed'|'failed'
  generated_content JSONB,
  agent_outputs JSONB,            -- 섹터별 에이전트 분석 결과
  output_file_url TEXT,
  confidence_score NUMERIC(3,2),  -- 0.00 ~ 1.00
  missing_fields TEXT[],
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 6. 사용량 추적 (구독제)
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  action TEXT NOT NULL,           -- 'report_generated'|'template_uploaded'|'api_call'
  tokens_used INTEGER,
  cost_cents INTEGER,             -- API 비용 (센트 단위)
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_startups_user_id ON startups(user_id);
CREATE INDEX idx_templates_vc_company_id ON templates(vc_company_id);
CREATE INDEX idx_usage_logs_user_id_created ON usage_logs(user_id, created_at);
```

## 3. JSONB 스키마 정의

`templates.sections` 표준 구조 (TypeScript 타입으로도 작성):

```typescript
type TemplateSection = {
  id: string;
  title: string;
  order: number;
  fields: TemplateField[];
};

type TemplateField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'currency' | 'percentage' | 'select' | 'date' | 'number';
  required?: boolean;
  maxLength?: number;
  options?: string[];      // select 타입용
  placeholder?: string;
};
```

기본 섹션 6개 (예시 데이터로 seed):
1. company_overview (회사 개요)
2. investment_points (투자 포인트 3개)
3. market_analysis (TAM/SAM/SOM)
4. financials (재무 현황)
5. risk_analysis (리스크 분석)
6. recommendation (투자 의견)

## 4. RLS 정책

```sql
-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- vc_companies
ALTER TABLE vc_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own vc_companies" ON vc_companies FOR ALL USING (auth.uid() = owner_id);

-- templates
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own templates" ON templates FOR ALL 
  USING (vc_company_id IN (SELECT id FROM vc_companies WHERE owner_id = auth.uid()));

-- startups, reports, usage_logs 동일하게 user_id 기반 RLS

-- 신규 가입 시 profile 자동 생성 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 5. Supabase Storage 버킷 설정 SQL

```sql
-- Storage 버킷
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('uploaded-files', 'uploaded-files', false),
  ('generated-reports', 'generated-reports', false),
  ('template-originals', 'template-originals', false),
  ('vc-logos', 'vc-logos', true);

-- Storage RLS
CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id IN ('uploaded-files', 'generated-reports', 'template-originals') 
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own files" ON storage.objects FOR SELECT 
  USING (auth.uid()::text = (storage.foldername(name))[1]);
```

## 6. 인증 페이지 구현

### `/app/(auth)/login/page.tsx`
- 이메일 + 비밀번호 로그인
- Google OAuth 버튼 (선택)
- 회원가입 링크
- shadcn/ui Card, Input, Button 사용

### `/app/(auth)/signup/page.tsx`
- 이메일, 비밀번호, 이름, VC사명 입력
- 회원가입 후 자동 로그인 + 대시보드 리다이렉트

### `/middleware.ts`
- 로그인 안 한 사용자가 (dashboard) 그룹 접근 시 /login으로 리다이렉트
- 세션 자동 갱신

## 7. 기본 대시보드 페이지

### `/app/(dashboard)/dashboard/page.tsx`
빈 상태 UI:
- 환영 메시지 ("안녕하세요 {이름}님")
- 활성화된 섹터 표시 (없으면 "섹터를 선택하세요")
- 빠른 시작 카드 3개:
  - "양식 등록하기"
  - "새 보고서 생성"
  - "포트폴리오 관리"
- 최근 생성 보고서 목록 (비어있음 상태)

### `/app/(dashboard)/layout.tsx`
- 사이드바 네비게이션
  - 대시보드 / 보고서 / 양식 / 포트폴리오 / 설정
- 우상단: 사용자 정보 + 로그아웃
- 로고: "DealSync"

## 8. 시드 데이터

`/supabase/seed.sql` - 개발용 샘플 데이터:
- 기본 템플릿 1개 (위에서 정의한 6개 섹션 구조)
- 6개 섹터 에이전트 정보를 JSON 상수로 (`/lib/agents/registry.ts`):

```typescript
export const AGENT_REGISTRY = {
  bio: {
    id: 'bio',
    name: 'Dr. Cell',
    nameKo: '닥터 셀',
    sector: '바이오/헬스케어',
    description: '임상약리학 박사 출신 AI 심사역',
    color: '#0EA5E9',
    icon: '🧬',
    available: true,
    specialFeatures: ['파이프라인 NPV', 'FDA 벤치마크', 'PubMed 인용', 'CRIS 연동']
  },
  it_saas: {
    id: 'it_saas',
    name: 'Code',
    nameKo: '코드',
    sector: 'IT/SaaS',
    description: '시리얼 창업가 출신 AI 심사역',
    color: '#6366F1',
    icon: '⚡',
    available: true,
    specialFeatures: ['GitHub 분석', 'SaaS KPI', 'SimilarWeb', '멀티플 비교']
  },
  // ... 나머지 4개 동일 패턴
};
```

## 9. 환경 변수 검증

`/lib/env.ts` - Zod로 환경 변수 검증:
```typescript
import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

## 완료 체크리스트

- [ ] Supabase 클라이언트 3종 (client/server/middleware)
- [ ] DB 스키마 SQL 파일 (migrations)
- [ ] RLS 정책 작성
- [ ] Storage 버킷 설정
- [ ] 로그인/회원가입 페이지
- [ ] 미들웨어 인증 보호
- [ ] 대시보드 레이아웃 + 빈 상태 UI
- [ ] Agent Registry 상수
- [ ] 환경 변수 검증

작업 완료 후 git commit 만들어주세요.
완료되면 "Phase 2 완료. Supabase 프로젝트에서 migrations/0001_initial_schema.sql을 실행한 다음 Phase 3 (Core Engine)을 진행하세요"라고 출력하세요.
