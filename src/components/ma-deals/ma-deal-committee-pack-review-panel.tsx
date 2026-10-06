"use client";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  PE_IC_REVIEW_DISPLAY_STATE_LABEL,
} from "@/lib/pe/ma-deal-labels";
import type { PEICReviewView, PEICReviewCommentView } from "@/lib/pe/pe-ic-review-signoff-types";

const DISPLAY_STATE_VARIANT: Record<string, StatusTone> = {
  NOT_REVIEWED: "neutral",
  IN_REVIEW: "info",
  CHANGES_REQUESTED: "critical",
  REVIEWED: "positive",
  RE_REVIEW_REQUIRED: "critical",
};

/**
 * IC Review Sign-off 패널(PR #110, §Step15). "검토 완료"는 투자 승인이
 * 아니다 — 이 패널 어디에도 그런 문구를 넣지 않는다(§7 최우선 원칙).
 *
 * 저장/표시 로직을 여기서 새로 만들지 않는다 — 서버가 매 요청마다
 * `computeReviewDisplayState()`로 계산해 내려준 `displayState`를 그대로
 * 보여줄 뿐이다. REVIEWED로 표시된 리뷰라도 자료가 바뀌면 서버가 다음
 * GET에서 자동으로 RE_REVIEW_REQUIRED로 내려준다(클라이언트가 판단하지
 * 않음).
 */
export function MaDealCommitteePackReviewPanel({
  maDealId,
  currentUserId,
  displayedFingerprint,
  canEdit,
  onReviewChanged,
}: {
  maDealId: string;
  currentUserId: string;
  displayedFingerprint: string | null;
  canEdit: boolean;
  /** PR #111 — 서명 상태 변경/코멘트 작성이 성공할 때마다 호출된다. 이
   * 패널 자신의 `refresh()`와는 별개로, 형제 컴포넌트(검토 이력/Audit
   * Trail 카드)에게 "새 스냅샷/감사 이벤트가 생겼을 수 있다"고 알리는
   * 용도일 뿐이다 — 이 컴포넌트는 그 카드의 상태를 직접 알지 못한다. */
  onReviewChanged?: () => void;
}) {
  const toast = useToast();
  const [reviews, setReviews] = useState<PEICReviewView[]>([]);
  const [comments, setComments] = useState<PEICReviewCommentView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draftComment, setDraftComment] = useState("");
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewHold, setReviewHold] = useState<string | null>(null);
  const pending = useRef(false);
  const readSequence = useRef(0);
  const resourceKey = `${maDealId}:${currentUserId}:${canEdit}`;
  const latestResource = useRef(resourceKey);
  latestResource.current = resourceKey;
  const alive = useRef(true);
  const contextKey = `${maDealId}:${currentUserId}:${canEdit}:${displayedFingerprint}`;
  const latestContext = useRef(contextKey);
  latestContext.current = contextKey;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = async () => {
    const resource = resourceKey;
    const sequence = ++readSequence.current;
    const current = () => alive.current && latestResource.current === resource && readSequence.current === sequence;
    setLoading(true);
    try {
      const [reviewsRes, commentsRes] = await Promise.all([
        fetch(`/api/ma-deals/${maDealId}/ic-review-signoff`),
        fetch(`/api/ma-deals/${maDealId}/ic-review-signoff/comments?targetType=COMMITTEE_PACK`),
      ]);
      if (!current()) return;
      if (!reviewsRes.ok || !commentsRes.ok) throw new Error("Review read unavailable");
      const [reviewJson, commentJson] = await Promise.all([reviewsRes.json(), commentsRes.json()]);
      if (!current()) return;
      if (!Array.isArray(reviewJson.data) || !Array.isArray(commentJson.data)) throw new Error("Review read invalid");
      setReviews(reviewJson.data);
      setComments(commentJson.data);
      const own = reviewJson.data.find((r: PEICReviewView) => r.reviewerId === currentUserId);
      if (own?.comment) setDraftComment(own.comment);
      setLoaded(true);
    } catch {
      if (current()) { setLoaded(false); toast.error("검토 현황을 불러오지 못했습니다"); }
    } finally {
      if (current()) setLoading(false);
    }
  };

  useEffect(() => {
    setLoaded(false);
    setReviews([]);
    setComments([]);
    setDraftComment("");
    setReviewHold(null);
    refresh();
    const sequenceRef = readSequence;
    return () => { sequenceRef.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maDealId, currentUserId, canEdit]);

  const ownReview = reviews.find((r) => r.reviewerId === currentUserId);
  const otherReviews = reviews.filter((r) => r.reviewerId !== currentUserId);

  const submitStatus = async (status: "IN_REVIEW" | "CHANGES_REQUESTED" | "REVIEWED") => {
    if (!canEdit || pending.current || reviewHold) return;
    if (status === "REVIEWED" && !displayedFingerprint) return;
    if (status === "CHANGES_REQUESTED" && !draftComment.trim()) {
      toast.error("변경 요청에는 코멘트가 필요합니다");
      return;
    }
    const submittedContext = contextKey;
    const current = () => alive.current && latestContext.current === submittedContext;
    pending.current = true;
    setBusy(true);
    try {
      const res = await fetch(`/api/ma-deals/${maDealId}/ic-review-signoff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment: draftComment.trim() || undefined,
          ...(status === "REVIEWED" ? { expectedFingerprint: displayedFingerprint } : {}),
        }),
      });
      if (!current()) return;
      if (res.status === 409) {
        setReviewHold("자료가 변경되었거나 다른 검토가 진행되었습니다. 최신 자료를 불러와 다시 확인해 주세요.");
        return;
      }
      if (!res.ok) {
        if (res.status >= 500) setReviewHold("저장 결과를 확인하지 못했습니다. 최신 자료와 검토 이력을 확인해 주세요.");
        toast.error("검토 상태를 변경하지 못했습니다");
        return;
      }
      toast.success("검토 상태를 업데이트했습니다");
      await refresh();
      if (current()) onReviewChanged?.();
    } catch {
      if (current()) {
        setReviewHold("저장 결과를 확인하지 못했습니다. 최신 자료와 검토 이력을 확인해 주세요.");
        toast.error("검토 상태를 변경하지 못했습니다");
      }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const submitComment = async () => {
    if (!canEdit || pending.current || !newComment.trim()) return;
    pending.current = true;
    setBusy(true);
    try {
      const res = await fetch(`/api/ma-deals/${maDealId}/ic-review-signoff/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "COMMITTEE_PACK", text: newComment.trim() }),
      });
      if (!res.ok) {
        throw new Error("코멘트 작성 실패");
      }
      setNewComment("");
      await refresh();
      onReviewChanged?.();
    } catch {
      if (alive.current) toast.error("코멘트 작성 실패");
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!loaded && !loading && <div role="alert" className="rounded-md border p-3 text-sm">
        검토 현황을 확인하지 못했습니다. <Button size="sm" variant="outline" onClick={refresh}>검토 현황 다시 조회</Button>
      </div>}
      {reviewHold && <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p>{reviewHold}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => window.location.reload()}>최신 자료 다시 불러오기</Button>
      </div>}

      {ownReview?.displayState === "RE_REVIEW_REQUIRED" && (
        <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            자료가 변경되었습니다. 재검토가 필요합니다.
            {ownReview.changedCategories.length > 0 && ` (변경된 영역: ${ownReview.changedCategories.join(", ")})`}
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">내 검토</CardTitle>
          <p className="text-xs text-gray-500">
            &ldquo;검토 완료&rdquo;는 이 자료를 확인했다는 뜻일 뿐, 투자 승인이나 추천을 의미하지 않습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">현재 상태:</span>
            <StatusBadge tone={DISPLAY_STATE_VARIANT[ownReview?.displayState ?? "NOT_REVIEWED"]}>
              {PE_IC_REVIEW_DISPLAY_STATE_LABEL[ownReview?.displayState ?? "NOT_REVIEWED"]}
            </StatusBadge>
          </div>
          <Textarea
            rows={3}
            placeholder="검토 메모(변경 요청 시 필수)"
            value={draftComment}
            onChange={(e) => setDraftComment(e.target.value)}
            disabled={!canEdit}
          />
          {canEdit ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" disabled={busy || !!reviewHold} onClick={() => submitStatus("IN_REVIEW")}>
                검토 시작
              </Button>
              <Button size="sm" variant="outline" disabled={busy || !!reviewHold} onClick={() => submitStatus("CHANGES_REQUESTED")}>
                변경 요청
              </Button>
              <Button size="sm" disabled={busy || !!reviewHold || !displayedFingerprint || loading || !loaded} onClick={() => submitStatus("REVIEWED")}>
                검토 완료
              </Button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">이 딜의 리뷰어 서명 권한이 없습니다(조회만 가능).</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">다른 리뷰어</CardTitle>
        </CardHeader>
        <CardContent>
          {otherReviews.length === 0 ? (
            <p className="text-sm text-gray-400">아직 다른 리뷰어의 서명 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {otherReviews.map((r) => (
                <li key={r.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{r.reviewerName ?? r.reviewerEmail ?? "리뷰어"}</p>
                    {r.comment && <p className="text-xs text-gray-500 mt-0.5">{r.comment}</p>}
                  </div>
                  <StatusBadge tone={DISPLAY_STATE_VARIANT[r.displayState]} className="shrink-0">
                    {PE_IC_REVIEW_DISPLAY_STATE_LABEL[r.displayState]}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">코멘트</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400">아직 코멘트가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="border rounded-md px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.authorName ?? c.authorEmail ?? "익명"}</span>
                    <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                  <p className="text-gray-600 mt-0.5">{c.text}</p>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="flex items-center gap-2">
              <Textarea
                rows={2}
                placeholder="코멘트 남기기"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" disabled={busy || !newComment.trim()} onClick={submitComment}>
                등록
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
