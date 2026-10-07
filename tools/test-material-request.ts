import assert from "node:assert/strict";
import { materialRequestDraft, materialRequestItems } from "../src/lib/material-request";
import type { VCMissingInformation } from "../src/lib/vc-decision-types";

const inputs = Array.from({ length: 12 }, (_, index) => ({ id: `source-${index}`, item: `확인 항목 ${index}`,
  priority: "HIGH", whyItMatters: "검토 필요", decisionImpact: "HIGH", requiredEvidence: `원본 자료 ${index}` })) as VCMissingInformation[];
const items = materialRequestItems(inputs);
assert.equal(items.length, 12, "Preserve every item beyond the brief's top three");
assert.equal(materialRequestDraft("회사", "보고서", []), "");
const draft = materialRequestDraft("회사", "보고서 1", [items[0], items[11]]);
assert.ok(draft.includes("원본 자료 11") && draft.includes("검토 기준: 보고서 1"));
assert.ok(!draft.includes("원본 자료 5"), "Unselected information must not enter the draft");
assert.ok(!draft.includes("HIGH"), "Internal priority labels are not recipient copy");
assert.equal(inputs[11].requiredEvidence, "원본 자료 11", "Leave scoped source data unchanged");
console.log("PASS material request: complete source list, selected-only draft, report provenance, empty selection");
