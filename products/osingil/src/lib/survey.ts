import { z } from "zod";
import { one, query } from "./db";

export interface SurveyOption {
  id: string;
  label: string;
}

export interface Survey {
  question: string;
  options: SurveyOption[];
  allow_other: boolean;
  randomize: boolean;
  enabled: boolean;
}

export const OTHER_ID = "other";

export const DEFAULT_SURVEY: Survey = {
  question: "저희 쇼핑몰을 처음 어떻게 알게 되셨나요?",
  options: [
    { id: "instagram", label: "인스타그램" },
    { id: "youtube", label: "유튜브" },
    { id: "naver_search", label: "네이버 검색" },
    { id: "naver_blog", label: "네이버 블로그·카페" },
    { id: "kakao", label: "카카오톡" },
    { id: "friend", label: "지인 추천" },
    { id: "tiktok", label: "틱톡" },
    { id: "google", label: "구글 검색" },
  ],
  allow_other: true,
  randomize: true,
  enabled: true,
};

export const surveyInput = z.object({
  question: z.string().trim().min(2, "질문을 2자 이상 입력하세요.").max(80, "질문은 80자 이하로 입력하세요."),
  options: z
    .array(
      z.object({
        id: z.string().trim().regex(/^[a-z0-9_]{1,40}$/, "보기 ID 형식이 올바르지 않습니다."),
        label: z.string().trim().min(1, "빈 보기가 있습니다.").max(30, "보기는 30자 이하로 입력하세요."),
      })
    )
    .min(2, "보기는 2개 이상 필요합니다.")
    .max(12, "보기는 12개까지 만들 수 있습니다.")
    .refine((opts) => new Set(opts.map((o) => o.id)).size === opts.length, "보기 ID가 중복됩니다.")
    .refine((opts) => opts.every((o) => o.id !== OTHER_ID), "'other'는 예약된 ID입니다."),
  allow_other: z.boolean(),
  randomize: z.boolean(),
  enabled: z.boolean(),
});

export async function getSurvey(mallId: string): Promise<Survey> {
  const row = await one<Survey>(
    `SELECT question, options, allow_other, randomize, enabled FROM surveys WHERE mall_id = $1`,
    [mallId]
  );
  if (!row) return DEFAULT_SURVEY;
  const options = typeof row.options === "string" ? (JSON.parse(row.options) as SurveyOption[]) : row.options;
  return { ...row, options };
}

export async function ensureSurvey(mallId: string) {
  await query(
    `INSERT INTO surveys (mall_id, question, options, allow_other, randomize, enabled)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6) ON CONFLICT (mall_id) DO NOTHING`,
    [mallId, DEFAULT_SURVEY.question, JSON.stringify(DEFAULT_SURVEY.options), true, true, true]
  );
}

export async function saveSurvey(mallId: string, s: Survey) {
  await query(
    `INSERT INTO surveys (mall_id, question, options, allow_other, randomize, enabled, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, now())
     ON CONFLICT (mall_id) DO UPDATE SET question = $2, options = $3::jsonb, allow_other = $4,
       randomize = $5, enabled = $6, updated_at = now()`,
    [mallId, s.question, JSON.stringify(s.options), s.allow_other, s.randomize, s.enabled]
  );
}

/** 보기 ID → 라벨. 응답 저장 시점의 라벨을 함께 저장해 나중에 보기 이름을 바꿔도 과거 기록이 유지된다. */
export function resolveAnswer(survey: Survey, answerId: string): string | null {
  if (answerId === OTHER_ID) return survey.allow_other ? "기타" : null;
  return survey.options.find((o) => o.id === answerId)?.label ?? null;
}
