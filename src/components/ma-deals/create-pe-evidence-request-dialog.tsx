"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileQuestion } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ICQuestion } from "@/lib/pe/pe-ic-decision-types";

interface FormData {
  title: string;
  requestedDocument: string;
  requestedFact: string;
  reason: string;
}

/**
 * IC Question → Evidence Request 생성(PR #109, §Step11). 새 질문을 만들지
 * 않는다 — `question.code`를 `reviewItemSourceId`로 그대로 넘겨 이미 있는
 * review item에 "근거를 요청했다"는 사람의 실제 행동만 기록한다. 서버가
 * 이 code를 현재 딜의 재계산 결과와 다시 대조하므로(evidence-requests
 * route.ts POST), 여기서 검증을 중복할 필요는 없다 — 실패하면 에러 메시지를
 * 그대로 보여준다.
 */
export function CreatePEEvidenceRequestDialog({
  maDealId,
  question,
  onCreated,
}: {
  maDealId: string;
  question: ICQuestion;
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const { register, handleSubmit, reset } = useForm<FormData>({
    defaultValues: {
      title: question.question,
      requestedDocument: "",
      requestedFact: "",
      reason: question.requiredEvidence,
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ma-deals/${maDealId}/evidence-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewItemSourceId: question.code,
          title: data.title,
          requestedDocument: data.requestedDocument.trim() || undefined,
          requestedFact: data.requestedFact.trim() || undefined,
          reason: data.reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "근거 요청 생성 실패");
      }
      toast.success("근거 요청을 만들었습니다");
      setOpen(false);
      reset();
      await onCreated();
    } catch (e) {
      toast.error("근거 요청 생성 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-7">
          <FileQuestion className="w-3.5 h-3.5 mr-1" />
          자료 요청
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>근거 요청 만들기</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <p className="text-xs text-gray-500 bg-gray-50 border rounded-md px-3 py-2">
            이 요청은 &ldquo;{question.question}&rdquo; 항목에 연결됩니다. 요청 자체는 판단을 바꾸지 않습니다 —
            실제로 필요한 자료가 업로드되고 검토·승인돼야 반영됩니다.
          </p>
          <div className="space-y-1.5">
            <Label>제목</Label>
            <Input {...register("title", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>요청 자료(선택)</Label>
            <Input {...register("requestedDocument")} placeholder="예: 2025년 매출 원장" />
          </div>
          <div className="space-y-1.5">
            <Label>확인이 필요한 사실(선택)</Label>
            <Input {...register("requestedFact")} placeholder="예: 상위 10개 고객 매출 비중" />
          </div>
          <div className="space-y-1.5">
            <Label>요청 사유</Label>
            <Textarea rows={3} {...register("reason", { required: true })} />
          </div>
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "만드는 중..." : "요청 만들기"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
