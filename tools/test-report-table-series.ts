import assert from "node:assert/strict";
import { reportTableSeries } from "../src/lib/report-table-series";

const table = "| 항목 | 2023 | 2024 | 2025 |\n| --- | --- | --- | --- |\n| 매출 (억원) | 1,200 | 미확인 | 1,500 |\n| 영업이익 (억원) | -10 | 0 | 12 |";
const result = reportTableSeries(table);
assert.deepEqual(result[0].points.map(point => point.value), [1200, null, 1500]);
assert.deepEqual(result[1].points.map(point => point.value), [-10, 0, 12]);
assert.equal(reportTableSeries(table.replaceAll(" (억원)", "")).length, 0, "no inferred unit");
assert.equal(reportTableSeries(table.replace("2025", "2024")).length, 0, "duplicate years rejected");
assert.equal(reportTableSeries("```\n" + table + "\n```").length, 0, "code block is not financial data");
assert.equal(reportTableSeries(table.replaceAll("2025", "2025E")).length, 0, "no silent forecast conversion");
assert.equal(reportTableSeries(table.replace("1,500", "약 1,500")).some(row => row.label.startsWith("매출")), false, "uncertainty is not removed");
assert.equal(reportTableSeries(table.replace("1,200", "12,00")).some(row => row.label.startsWith("매출")), false, "malformed number rejected");
console.log("PASS report table series: missing, zero, negative, units, duplicate periods, code, forecasts and uncertainty");
