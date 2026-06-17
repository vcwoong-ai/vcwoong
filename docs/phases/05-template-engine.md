# Phase 5: 양식 1:1 재현 엔진

다음 내용을 Claude Code 새 세션에 그대로 붙여넣으세요.

---

DealSync Phase 5를 진행합니다.
**경쟁사 대비 우리의 가장 강력한 해자**입니다. VC사가 쓰던 양식을 그대로 재현합니다.

## 작업 목표

1. PPTX/Word 양식 분석 (디자인 토큰 + placeholder 위치 추출)
2. AI 매핑 어시스턴트 (placeholder ↔ 보고서 필드 자동 매칭)
3. 재구성 엔진 (원본 양식 + AI 생성 내용 = 완성된 PPTX/Word)
4. 검증 UI (생성본 vs 원본 시각 비교)

## 1. PPTX 양식 분석기

`/lib/template-parser/pptx-analyzer.ts`:

```typescript
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export type SlideElement = {
  type: 'text' | 'image' | 'shape' | 'table' | 'placeholder';
  id: string;
  position: { x: number; y: number; w: number; h: number };  // EMU 단위 → mm 변환
  textContent?: string;
  fontInfo?: {
    family?: string;
    size?: number;
    color?: string;
    bold?: boolean;
  };
  placeholderType?: string;
  imageData?: string;  // base64
};

export type SlideAnalysis = {
  slideNum: number;
  layoutType: string;
  background?: string;
  elements: SlideElement[];
  notes?: string;
};

export type TemplateAnalysis = {
  fileType: 'pptx';
  slideCount: number;
  slides: SlideAnalysis[];
  designTokens: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontHeading?: string;
    fontBody?: string;
    logoPosition?: { x: number; y: number; w: number; h: number };
    logoImageBase64?: string;
  };
  slideSize: { w: number; h: number };  // mm
};

export async function analyzePPTX(file: File | Buffer): Promise<TemplateAnalysis> {
  const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  
  // 1. presentation.xml로 슬라이드 크기 + 슬라이드 목록
  const presXml = await zip.file('ppt/presentation.xml')!.async('string');
  const presData = parser.parse(presXml);
  
  const slideSize = extractSlideSize(presData);
  
  // 2. theme1.xml로 디자인 토큰
  const themeXml = await zip.file('ppt/theme/theme1.xml')!.async('string');
  const themeData = parser.parse(themeXml);
  const designTokens = extractDesignTokens(themeData);
  
  // 3. 각 슬라이드 분석
  const slideFiles = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  const slides: SlideAnalysis[] = [];
  
  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.file(slideFiles[i])!.async('string');
    const slideData = parser.parse(slideXml);
    slides.push(await analyzeSlide(slideData, i + 1, zip));
  }
  
  // 4. 첫 슬라이드에서 로고 추정 (우상단 이미지)
  const logo = findLogo(slides[0]);
  if (logo) {
    designTokens.logoPosition = logo.position;
    designTokens.logoImageBase64 = logo.imageData;
  }
  
  return {
    fileType: 'pptx',
    slideCount: slides.length,
    slides,
    designTokens,
    slideSize,
  };
}

function extractSlideSize(presData: any) {
  const sldSz = presData?.['p:presentation']?.['p:sldSz'];
  return {
    w: Math.round((Number(sldSz?.['@_cx']) || 9144000) / 36000),  // EMU → mm
    h: Math.round((Number(sldSz?.['@_cy']) || 6858000) / 36000),
  };
}

function extractDesignTokens(themeData: any): TemplateAnalysis['designTokens'] {
  // a:clrScheme에서 색상 추출
  const clrScheme = themeData?.['a:theme']?.['a:themeElements']?.['a:clrScheme'];
  // a:fontScheme에서 폰트 추출
  const fontScheme = themeData?.['a:theme']?.['a:themeElements']?.['a:fontScheme'];
  
  return {
    primaryColor: extractColor(clrScheme?.['a:accent1']),
    secondaryColor: extractColor(clrScheme?.['a:accent2']),
    accentColor: extractColor(clrScheme?.['a:accent3']),
    fontHeading: fontScheme?.['a:majorFont']?.['a:ea']?.['@_typeface'] || 
                  fontScheme?.['a:majorFont']?.['a:latin']?.['@_typeface'],
    fontBody: fontScheme?.['a:minorFont']?.['a:ea']?.['@_typeface'] || 
              fontScheme?.['a:minorFont']?.['a:latin']?.['@_typeface'],
  };
}

function extractColor(node: any): string | undefined {
  if (!node) return undefined;
  const srgb = node['a:srgbClr']?.['@_val'];
  return srgb ? `#${srgb}` : undefined;
}

async function analyzeSlide(slideData: any, slideNum: number, zip: JSZip): Promise<SlideAnalysis> {
  const shapes = slideData?.['p:sld']?.['p:cSld']?.['p:spTree']?.['p:sp'] || [];
  const pics = slideData?.['p:sld']?.['p:cSld']?.['p:spTree']?.['p:pic'] || [];
  
  const elements: SlideElement[] = [];
  
  // 텍스트 박스
  const spArray = Array.isArray(shapes) ? shapes : [shapes];
  for (const sp of spArray) {
    if (!sp) continue;
    const xfrm = sp?.['p:spPr']?.['a:xfrm'];
    if (!xfrm) continue;
    
    const off = xfrm['a:off'];
    const ext = xfrm['a:ext'];
    
    // 텍스트 추출
    const txBody = sp?.['p:txBody'];
    const paragraphs = Array.isArray(txBody?.['a:p']) ? txBody['a:p'] : [txBody?.['a:p']].filter(Boolean);
    const text = paragraphs
      .map((p: any) => {
        const runs = Array.isArray(p?.['a:r']) ? p['a:r'] : [p?.['a:r']].filter(Boolean);
        return runs.map((r: any) => r?.['a:t'] || '').join('');
      })
      .join('\n');
    
    elements.push({
      type: 'text',
      id: sp?.['p:nvSpPr']?.['p:cNvPr']?.['@_id'] || `text_${elements.length}`,
      position: {
        x: emuToMm(off?.['@_x']),
        y: emuToMm(off?.['@_y']),
        w: emuToMm(ext?.['@_cx']),
        h: emuToMm(ext?.['@_cy']),
      },
      textContent: text,
      placeholderType: sp?.['p:nvSpPr']?.['p:nvPr']?.['p:ph']?.['@_type'],
    });
  }
  
  // 이미지
  const picArray = Array.isArray(pics) ? pics : [pics];
  for (const pic of picArray) {
    if (!pic) continue;
    const xfrm = pic?.['p:spPr']?.['a:xfrm'];
    if (!xfrm) continue;
    
    // 이미지 데이터 추출 (relationship으로 연결됨)
    elements.push({
      type: 'image',
      id: pic?.['p:nvPicPr']?.['p:cNvPr']?.['@_id'] || `img_${elements.length}`,
      position: {
        x: emuToMm(xfrm['a:off']?.['@_x']),
        y: emuToMm(xfrm['a:off']?.['@_y']),
        w: emuToMm(xfrm['a:ext']?.['@_cx']),
        h: emuToMm(xfrm['a:ext']?.['@_cy']),
      },
    });
  }
  
  return {
    slideNum,
    layoutType: inferLayoutType(elements),
    elements,
  };
}

function emuToMm(emu: string | number | undefined): number {
  return Math.round((Number(emu) || 0) / 36000);
}

function inferLayoutType(elements: SlideElement[]): string {
  // 휴리스틱: 텍스트 박스 수와 위치로 레이아웃 추정
  const textBoxes = elements.filter(e => e.type === 'text');
  if (textBoxes.length === 1) return 'title';
  if (textBoxes.length === 2) return 'title_content';
  return 'content';
}

function findLogo(slide: SlideAnalysis | undefined): SlideElement | undefined {
  if (!slide) return undefined;
  // 우상단 작은 이미지를 로고로 추정
  return slide.elements.find(e => 
    e.type === 'image' && 
    e.position.x > 200 && e.position.y < 30 &&
    e.position.w < 50 && e.position.h < 30
  );
}
```

## 2. DOCX 양식 분석기

`/lib/template-parser/docx-analyzer.ts`:

```typescript
import mammoth from 'mammoth';

export async function analyzeDOCX(file: File | Buffer) {
  const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
  
  // mammoth로 HTML 변환 (스타일 정보 유지)
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1.heading1",
        "p[style-name='Heading 2'] => h2.heading2",
      ]
    }
  );
  
  // HTML 파싱으로 스타일 정보 추출
  // 또는 raw .docx XML 직접 파싱
  // ...
  
  return {
    fileType: 'docx',
    htmlContent: result.value,
    // 스타일 정보 추출 결과
  };
}
```

## 3. AI 매핑 어시스턴트

`/lib/template-parser/field-mapper.ts`:

원본 양식의 placeholder를 우리 시스템의 표준 필드와 자동 매칭:

```typescript
import { callClaudeJSON } from '@/lib/anthropic/client';
import type { TemplateAnalysis, SlideElement } from './pptx-analyzer';

export type FieldMapping = {
  slideNum: number;
  elementId: string;
  originalText: string;
  position: { x: number; y: number; w: number; h: number };
  mappedField: string;        // 'company_name', 'business_summary' 등
  mappedSection: string;      // 'company_overview', 'market_analysis' 등
  confidence: number;
};

export async function mapTemplateFields(
  analysis: TemplateAnalysis
): Promise<FieldMapping[]> {
  // 빈 placeholder들 수집
  const textBoxes = analysis.slides.flatMap(s =>
    s.elements
      .filter(e => e.type === 'text')
      .map(e => ({ slide: s.slideNum, element: e }))
  );
  
  // Claude API에게 매핑 요청
  const result = await callClaudeJSON<{ mappings: FieldMapping[] }>({
    system: `당신은 PPT 양식 분석 전문가입니다. 
각 텍스트 박스가 투자심사보고서의 어떤 필드인지 추론합니다.`,
    messages: [{
      role: 'user',
      content: `다음 PPT 텍스트 박스들이 어떤 보고서 필드인지 매핑하세요:

${textBoxes.map(tb => `슬라이드 ${tb.slide}, ID:${tb.element.id}, 위치:(${tb.element.position.x},${tb.element.position.y}), 내용:"${tb.element.textContent?.slice(0, 100)}"`).join('\n')}

가능한 필드:
- 섹션 company_overview: company_name, founded_year, business_summary, investment_amount
- 섹션 investment_points: point_1, point_2, point_3
- 섹션 market_analysis: tam, sam, som, market_description
- 섹션 financials: revenue_current, revenue_growth, burn_rate, runway
- 섹션 risk_analysis: risk_1, risk_2, mitigation
- 섹션 recommendation: opinion, valuation_opinion, conditions, reviewer_comment
- 메타: title (보고서 제목), date (작성일), reviewer (심사역명)
- skip: 매핑할 필요 없음 (꾸미기, 페이지 번호 등)

JSON 응답:
{ "mappings": [{ "slideNum": 1, "elementId": "...", "originalText": "...", "position": {...}, "mappedField": "company_name", "mappedSection": "company_overview", "confidence": 0.95 }] }`
    }],
    maxTokens: 4096,
  });
  
  return result.mappings;
}
```

## 4. PPTX 재구성 엔진 (핵심)

`/lib/template-generator/pptx-rebuilder.ts`:

원본 양식 + AI 생성 내용 → 완성된 PPTX

```typescript
import PptxGenJS from 'pptxgenjs';
import type { TemplateAnalysis } from '@/lib/template-parser/pptx-analyzer';
import type { FieldMapping } from '@/lib/template-parser/field-mapper';

export type GenerationInput = {
  analysis: TemplateAnalysis;
  mappings: FieldMapping[];
  content: Record<string, string>;  // field_key → 실제 내용
  metadata: {
    companyName: string;
    reviewerName: string;
    reviewDate: string;
  };
};

export async function rebuildPPTX(input: GenerationInput): Promise<Buffer> {
  const pres = new PptxGenJS();
  
  // 원본 슬라이드 크기 적용
  pres.defineLayout({
    name: 'CUSTOM',
    width: input.analysis.slideSize.w / 25.4,   // mm → inch
    height: input.analysis.slideSize.h / 25.4,
  });
  pres.layout = 'CUSTOM';
  
  // 각 슬라이드 재구성
  for (const slideAnalysis of input.analysis.slides) {
    const slide = pres.addSlide();
    
    for (const element of slideAnalysis.elements) {
      if (element.type === 'image' && element.imageData) {
        // 이미지 복원
        slide.addImage({
          data: `data:image/png;base64,${element.imageData}`,
          x: element.position.x / 25.4,
          y: element.position.y / 25.4,
          w: element.position.w / 25.4,
          h: element.position.h / 25.4,
        });
      } else if (element.type === 'text') {
        // 매핑된 필드인지 확인
        const mapping = input.mappings.find(
          m => m.slideNum === slideAnalysis.slideNum && m.elementId === element.id
        );
        
        let textContent = element.textContent || '';
        if (mapping && mapping.mappedField !== 'skip') {
          textContent = input.content[mapping.mappedField] || textContent;
        }
        
        // 글자 수에 따른 폰트 크기 자동 조정
        const fontSize = autoFontSize(textContent, element.position);
        
        slide.addText(textContent, {
          x: element.position.x / 25.4,
          y: element.position.y / 25.4,
          w: element.position.w / 25.4,
          h: element.position.h / 25.4,
          fontSize,
          fontFace: element.fontInfo?.family || input.analysis.designTokens.fontBody || '맑은 고딕',
          color: element.fontInfo?.color?.replace('#', '') || '333333',
          bold: element.fontInfo?.bold || false,
          valign: 'top',
        });
      }
    }
  }
  
  // 로고 추가 (모든 슬라이드 우상단)
  if (input.analysis.designTokens.logoImageBase64 && input.analysis.designTokens.logoPosition) {
    // 각 슬라이드에 로고 추가 로직
  }
  
  // Buffer로 반환
  const buffer = await pres.write({ outputType: 'nodebuffer' }) as Buffer;
  return buffer;
}

function autoFontSize(text: string, position: { w: number; h: number }): number {
  const area = position.w * position.h;
  const charsPerArea = text.length / area;
  
  if (charsPerArea < 0.05) return 18;
  if (charsPerArea < 0.1) return 14;
  if (charsPerArea < 0.2) return 12;
  return 10;
}
```

## 5. Word 재구성 엔진

`/lib/template-generator/docx-rebuilder.ts`:

```typescript
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';

export async function rebuildDOCX(input: any): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // 섹션별로 헤더 + 본문 자동 생성
        // 원본 스타일 (폰트, 색상) 적용
      ]
    }]
  });
  
  return await Packer.toBuffer(doc);
}
```

## 6. 양식 등록 워크플로우 API

`/app/api/templates/analyze/route.ts`:
- POST: 양식 파일 업로드 → 분석 → 매핑 추론 → 저장
- 응답: { templateId, analysis, mappings }

`/app/api/templates/[id]/route.ts`:
- GET: 양식 조회
- PUT: 매핑 수정 (사용자가 자동 매핑 검토 후 수정 가능)
- DELETE: 삭제

## 7. 보고서 생성 통합 API

`/app/api/reports/generate/route.ts`:
- POST: { startupId, templateId, content }
- 작업:
  1. 양식 분석 + 매핑 조회
  2. content 데이터를 매핑된 필드에 채움
  3. rebuildPPTX 또는 rebuildDOCX 호출
  4. Supabase Storage에 저장
  5. signed URL 반환

## 8. UI - 양식 등록 페이지

`/app/(dashboard)/templates/new/page.tsx`:

3단계 마법사:

**Step 1: 양식 업로드**
- 드래그앤드롭으로 PPTX/DOCX 업로드
- 업로드 후 즉시 분석 시작 (로딩 표시)

**Step 2: 자동 매핑 검토**
- 좌측: 원본 양식 미리보기
- 우측: 매핑 결과 (편집 가능)
- 잘못 매핑된 항목 수정 가능
- 잘못된 매핑 신뢰도 < 0.7은 빨간색 강조

**Step 3: 확정 및 저장**
- 양식 이름 입력
- 보고서 타입 선택 (initial/followon/exit)
- VC 회사 정보 (이름, 로고 업로드)
- "저장하기" 버튼

## 9. UI - 양식 미리보기 컴포넌트

`/components/templates/template-preview.tsx`:

- PPTX의 각 슬라이드를 CSS로 시각화
- 매핑된 placeholder를 색상 박스로 표시
- 클릭 시 상세 매핑 편집

## 10. 검증 UI - 생성본 vs 원본 비교

`/components/reports/diff-viewer.tsx`:

- 좌우 split view
- 좌: 원본 양식
- 우: 생성된 보고서
- 차이점 하이라이트 (텍스트만 바뀌고 디자인은 동일해야 정상)

## 완료 체크리스트

- [ ] PPTX 양식 분석기 (디자인 토큰 + 위치 추출)
- [ ] DOCX 양식 분석기
- [ ] AI 매핑 어시스턴트
- [ ] PPTX 재구성 엔진
- [ ] DOCX 재구성 엔진
- [ ] 양식 등록 API
- [ ] 보고서 생성 API
- [ ] 양식 등록 UI (3단계 마법사)
- [ ] 양식 미리보기 컴포넌트
- [ ] 생성본 비교 뷰어

git commit 후 "Phase 5 완료. Phase 6 (UI + 배포)를 진행하세요"라고 출력하세요.
