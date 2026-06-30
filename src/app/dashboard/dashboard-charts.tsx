"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#06B6D4","#F97316","#EC4899","#6366F1"];

interface ChartProps {
  dailyTokens: Array<{ date: string; tokens: number }>;
  sectorData: Array<{ name: string; value: number }>;
  stageData: Array<{ name: string; value: number }>;
  totalTokens: number;
}

export function DashboardCharts({ dailyTokens, sectorData, stageData, totalTokens }: ChartProps) {
  if (sectorData.length === 0 && stageData.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 섹터별 딜 */}
      {sectorData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">섹터별 딜</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={sectorData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  label={({ name, value }) => `${name} ${value}`}
                  labelLine={false}
                  fontSize={11}
                >
                  {sectorData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 단계별 딜 */}
      {stageData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">단계별 딜</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stageData} margin={{ top: 5, right: 5, bottom: 20, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#3B82F6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 토큰 사용량 (최근 30일) */}
      {dailyTokens.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">AI 토큰 사용량 (30일)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyTokens} margin={{ top: 5, right: 5, bottom: 20, left: -20 }}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} tokens`, "사용량"]} />
                <Bar dataKey="tokens" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : totalTokens === 0 && sectorData.length > 0 ? (
        <Card className="flex items-center justify-center">
          <CardContent className="text-center text-sm text-gray-400 py-8">
            <p>토큰 추적 데이터 없음</p>
            <p className="text-xs mt-1">보고서 생성 후 표시됩니다</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
