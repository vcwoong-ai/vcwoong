export async function parsePPTX(
  buffer: Buffer
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  try {
    // Dynamic import to avoid bundler issues
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
      .filter((name) => name.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0");
        const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0");
        return na - nb;
      });

    const slideTexts: string[] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.files[slideFiles[i]].async("text");
      const texts = extractTextFromXML(xml);
      if (texts.length > 0) {
        slideTexts.push(`[슬라이드 ${i + 1}]\n${texts.join("\n")}`);
      }
    }

    return {
      text: slideTexts.join("\n\n"),
      metadata: { type: "pptx", slideCount: slideFiles.length },
    };
  } catch {
    return { text: "", metadata: { type: "pptx", slideCount: 0 } };
  }
}

function extractTextFromXML(xml: string): string[] {
  const results: string[] = [];
  const rPattern = /<a:r[^>]*>[\s\S]*?<\/a:r>/g;
  const tPattern = /<a:t[^>]*>([\s\S]*?)<\/a:t>/;

  const runs = xml.match(rPattern) ?? [];
  for (const run of runs) {
    const match = run.match(tPattern);
    if (match?.[1]) {
      const text = match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      if (text) results.push(text);
    }
  }
  return results;
}
