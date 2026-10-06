/** Real Office/PDF parsers on memory-only synthetic files; recovery repository/storage ports are mocked. */
/* eslint-disable @typescript-eslint/no-explicit-any -- VM service exports are a test-only dynamic port; real parser imports remain intact. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import { Document, Packer, Paragraph } from "docx";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";
import { parseDocument } from "../src/lib/document-parser";
import { validateUploadFile } from "../src/lib/upload-security";
import type { PEUploadRow, PEParseRecoveryRepository } from "../src/lib/pe/pe-document-upload";
let stage = "memory format fixtures";
let diagnostics: { failure: string; errorClass: string; namedRead?: boolean; defaultRead?: boolean; namedUtils?: boolean; defaultUtils?: boolean; staticFixtureReadable?: boolean; parseCompleted?: boolean; oneParse?: boolean; oneUpload?: boolean; oneRow?: boolean; markerPresent?: boolean; referencePreserved?: boolean; sourceBytesPreserved?: boolean } | undefined;
const marker = "SYNTHETIC_PE_REPARSE_FORMAT_MARKER";
const text = Array.from({ length: 12 }, (_value, index) => `${marker} ${index + 1} Synthetic confirmed source material for parser recovery only.`).join("\n");
function syntheticPdf(): Buffer {
  // Same minimal real text-layer PDF construction used by tools/test-evidence.ts, with ASCII bytes/xref offsets.
  const stream = `BT /F1 8 Tf 40 760 Td ${text.split("\n").map((line, index) => `${index ? "0 -14 Td " : ""}(${line}) Tj`).join("\n")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = "%PDF-1.4\n"; const offsets: number[] = [];
  objects.forEach((body, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
async function formats() {
  const docx = await Packer.toBuffer(new Document({ sections: [{ children: text.split("\n").map(line => new Paragraph(line)) }] }));
  const pptx = new PptxGenJS(); pptx.addSlide().addText(text, { x: 0.5, y: 0.5, w: 9, h: 5, fontSize: 12 });
  const pptxBytes = Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as Buffer);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(text.split("\n").map(line => [line])), "Synthetic");
  const xlsx = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return [{ ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: docx }, { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: pptxBytes }, { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: xlsx }, { ext: "pdf", mime: "application/pdf", bytes: syntheticPdf() }];
}
function serviceModule() {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/pe/pe-document-upload.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Buffer, Date, URL, console: { error() {}, warn() {} }, require(name: string) {
      if (name === "node:crypto") return crypto;
      if (name === "@prisma/client") return { MaDocumentType: { DD_MATERIAL: "DD_MATERIAL" } };
      if (name === "@/lib/upload-security") return { validateUploadFile };
      if (name === "@/lib/storage") return { isPrivateStoredFileReference: (ref: string, key: string) => ref === `private-local:${key}` };
      throw new Error("Unexpected format recovery dependency");
    } });
  return exports;
}
async function main() {
  const serviceExports = serviceModule();
  for (const format of await formats()) {
    for (const phase of ["WARNING", "PARSING"]) {
      stage = `${format.ext} real parser from ${phase}`;
      const now = new Date("2026-10-05T00:00:00Z"), rows = new Map<string, PEUploadRow>(); let uploads = 0, parses = 0;
      const repository: PEParseRecoveryRepository = {
        find: async id => rows.has(id) ? structuredClone(rows.get(id)!) : null,
        reserve: async row => { if (rows.has(row.id)) return false; rows.set(row.id, structuredClone(row)); return true; },
        claimParse: async (row, token, at) => {
          const current = rows.get(row.id), summary = serviceExports.peDocumentParseSummary(row, at);
          if (!current || !summary.parseRetryAllowed || current.url !== row.url || JSON.stringify(current.metadata) !== JSON.stringify(row.metadata)) return false;
          rows.set(row.id, structuredClone({ ...row, metadata: { ...(row.metadata as object), __peUpload: { ...(row.metadata as any).__peUpload, phase: "PARSING", token, expiresAt: at.getTime() + 600000, parseAttempts: summary.parseAttempts + 1 } } })); return true;
        },
        update: async (row, token, at, patch) => {
          const current = rows.get(row.id), state = (row.metadata as any).__peUpload;
          if (!current || state.token !== token || state.expiresAt <= at.getTime() || current.url !== row.url || JSON.stringify(current.metadata) !== JSON.stringify(row.metadata)) return false;
          rows.set(row.id, structuredClone({ ...current, ...patch })); return true;
        },
      };
      const input = { userId: "synthetic-format-owner", dealId: "synthetic-format-deal", uploadId: crypto.randomUUID(), fileName: `synthetic.${format.ext}`, mimeType: format.mime, type: "DD_MATERIAL", bytes: format.bytes };
      const upload = new serviceExports.PEUploadService({ repository, now: () => now, newToken: () => "synthetic-upload-token", upload: async (bytes: Buffer, key: string) => { uploads++; assert.deepEqual(bytes, format.bytes); return `private-local:${key}`; }, parse: async () => { throw new Error("Synthetic initial parsing interrupted"); } });
      const created = await upload.submit(input); const row = rows.get(created.data.id)!; assert(row);
      if (phase === "PARSING") (row.metadata as any).__peUpload = { ...(row.metadata as any).__peUpload, phase: "PARSING", token: "synthetic-expired-worker", expiresAt: now.getTime() - 1 };
      const originalUrl = row.url, originalBytes = Buffer.from(format.bytes);
      const recovery = new serviceExports.PEParseRecoveryService({ repository, now: () => now, newToken: () => "synthetic-recovery-token",
        // Real storage returns a fresh read buffer. Parsers may mutate that working buffer;
        // it must not be aliased to the test's persisted original bytes.
        read: async (ref: string, max: number) => { assert.equal(ref, originalUrl); assert.equal(max, 4 * 1024 * 1024); return Buffer.from(originalBytes); },
        parse: async (bytes: Buffer, mime: string, name: string) => {
          parses++; assert.equal(mime, format.mime); assert.equal(name, input.fileName);
          try { return await parseDocument(bytes, mime, name); }
          catch (error) {
            const message = error instanceof Error ? error.message : "";
            diagnostics = { failure: /^xlsx\.read is not a function$/.test(message) ? "XLSX_DYNAMIC_READ_MISSING" : /^Cannot read properties of undefined/.test(message) && format.ext === "xlsx" ? "XLSX_DYNAMIC_MEMBER_UNAVAILABLE" : "PARSER_EXCEPTION_UNCLASSIFIED", errorClass: error instanceof TypeError ? "TypeError" : error instanceof RangeError ? "RangeError" : error instanceof Error ? "Error" : "OTHER" };
            if (format.ext === "xlsx") {
              const dynamic: any = await import("xlsx");
              diagnostics.namedRead = typeof dynamic.read === "function"; diagnostics.defaultRead = typeof dynamic.default?.read === "function";
              diagnostics.namedUtils = typeof dynamic.utils?.sheet_to_csv === "function"; diagnostics.defaultUtils = typeof dynamic.default?.utils?.sheet_to_csv === "function";
              try { const check = XLSX.read(bytes, { type: "buffer" }); diagnostics.staticFixtureReadable = check.SheetNames.length === 1 && XLSX.utils.sheet_to_csv(check.Sheets[check.SheetNames[0]]).includes(marker); }
              catch { diagnostics.staticFixtureReadable = false; }
            }
            throw error;
          }
        },
      });
      const result = await recovery.retry({ dealId: input.dealId, documentId: row.id });
      diagnostics ??= { failure: "POST_PARSE_ASSERTION", errorClass: "NONE" };
      diagnostics.parseCompleted = result.parseStatus === "complete"; diagnostics.oneParse = parses === 1; diagnostics.oneUpload = uploads === 1; diagnostics.oneRow = rows.size === 1;
      diagnostics.markerPresent = rows.get(row.id)!.parsedText?.includes(marker) === true; diagnostics.referencePreserved = rows.get(row.id)!.url === originalUrl; diagnostics.sourceBytesPreserved = format.bytes.equals(originalBytes);
      stage = `${format.ext} ${phase} parseStatus`; assert.equal(result.parseStatus, "complete");
      stage = `${format.ext} ${phase} parse/upload counts`; assert.equal(parses, 1); assert.equal(uploads, 1); assert.equal(rows.size, 1);
      stage = `${format.ext} ${phase} real extracted marker`; assert(rows.get(row.id)!.parsedText?.includes(marker));
      stage = `${format.ext} ${phase} original reference`; assert.equal(rows.get(row.id)!.url, originalUrl);
      stage = `${format.ext} ${phase} persisted bytes`; assert.deepEqual(format.bytes, originalBytes);
      const serialized = JSON.stringify(result); for (const secret of ["private-local:", "__peUpload", "fingerprint", marker, '"token"']) assert.equal(serialized.includes(secret), false);
      diagnostics = undefined;
    }
  }
  console.log("PASS memory synthetic DOCX/PPTX/XLSX/PDF actual parseDocument recovery from WARNING/expired PARSING; original bytes/reference unchanged and no extra upload; mocked repository/storage only, no DB/files/providers/browser");
}
main().catch(() => { console.error(JSON.stringify({ result: "PE_REPARSE_FORMATS_FAILED", stage, diagnostics: diagnostics ?? "DETAILS_WITHHELD" })); process.exitCode = 1; });
