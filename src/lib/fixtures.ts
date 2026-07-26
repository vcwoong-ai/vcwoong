import { DealSector } from "@prisma/client";

export interface GoldenFixture {
  id: string;
  sector: DealSector;
  label: string;
  companyName: string;
  fileName: string;
  relativePath: string;
  investRound: string;
  investAmount: number;
  valuation: number;
}

/** 로컬 연습용 골든 IR 픽스처 목록 */
export const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    id: "bio",
    sector: DealSector.BIO,
    label: "BIO · 헬스케어AI",
    companyName: "헬스케어AI Inc.",
    fileName: "bio-healthcareai-ir.md",
    relativePath: "docs/fixtures/bio-healthcareai-ir.md",
    investRound: "Series B",
    investAmount: 100,
    valuation: 800,
  },
  {
    id: "it",
    sector: DealSector.IT,
    label: "IT · DataFlow",
    companyName: "DataFlow SaaS",
    fileName: "it-dataflow-ir.md",
    relativePath: "docs/fixtures/it-dataflow-ir.md",
    investRound: "Series A",
    investAmount: 50,
    valuation: 300,
  },
  {
    id: "manufacturing",
    sector: DealSector.MANUFACTURING,
    label: "제조 · Maker Corp",
    companyName: "Maker Corp",
    fileName: "manufacturing-maker-ir.md",
    relativePath: "docs/fixtures/manufacturing-maker-ir.md",
    investRound: "Series B",
    investAmount: 80,
    valuation: 450,
  },
  {
    id: "content",
    sector: DealSector.CONTENT,
    label: "콘텐츠 · StoryWorks",
    companyName: "StoryWorks",
    fileName: "content-storyworks-ir.md",
    relativePath: "docs/fixtures/content-storyworks-ir.md",
    investRound: "Series A",
    investAmount: 40,
    valuation: 220,
  },
  {
    id: "climate",
    sector: DealSector.CLIMATE,
    label: "기후 · GreenLoop",
    companyName: "GreenLoop",
    fileName: "climate-greenloop-ir.md",
    relativePath: "docs/fixtures/climate-greenloop-ir.md",
    investRound: "Series A",
    investAmount: 60,
    valuation: 280,
  },
  {
    id: "consumer",
    sector: DealSector.CONSUMER,
    label: "소비재 · BloomLab",
    companyName: "BloomLab",
    fileName: "consumer-bloomlab-ir.md",
    relativePath: "docs/fixtures/consumer-bloomlab-ir.md",
    investRound: "Series A",
    investAmount: 45,
    valuation: 200,
  },
];

export function fixtureForSector(sector: DealSector): GoldenFixture | undefined {
  return GOLDEN_FIXTURES.find((f) => f.sector === sector);
}
