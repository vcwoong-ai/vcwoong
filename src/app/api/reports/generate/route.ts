import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rebuildDOCX, type DocxSection } from "@/lib/template-generator/docx-rebuilder";
import { z } from "zod";

const schema = z.object({
  companyName: z.string(),
  reviewerName: z.string().default("심사역"),
  reviewDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  sections: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
    })
  ),
  format: z.enum(["docx", "pptx"]).default("docx"),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { companyName, reviewerName, reviewDate, sections, format } = parsed.data;

  try {
    if (format === "docx") {
      const buffer = await rebuildDOCX(sections as DocxSection[], {
        companyName,
        reviewerName,
        reviewDate,
      });

      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(companyName)}_심사보고서.docx"`,
        },
      });
    }

    return NextResponse.json({ error: "PPTX 생성은 템플릿 등록 후 가능합니다" }, { status: 400 });
  } catch (error) {
    console.error("Report generate error:", error);
    return NextResponse.json({ error: "보고서 생성 중 오류가 발생했습니다" }, { status: 500 });
  }
}
