import { ArrowRight, FileText, GitCompareArrows, MessageSquareText, ScanLine } from "lucide-react";
import styles from "./visual-story.module.css";

/** Display-only illustration. Values are labelled synthetic; no decision/financial calculation. */
export function EvidenceStoryboard() {
  return (
    <figure className={styles.board} data-testid="evidence-storyboard">
      <figcaption className={styles.boardCaption}>
        <span><ScanLine size={16} aria-hidden="true" /> 근거를 따라가는 하나의 흐름</span>
        <span>예시 데이터 · FY2024 · KRW</span>
      </figcaption>
      <div className={styles.stages}>
        <div className={styles.sourceStage}>
          <p className={styles.eyebrow}>01 / SOURCE DOCUMENTS</p>
          <h3>흩어진 자료에서</h3>
          <div className={styles.documents}>
            <div className={styles.document}>
              <FileText size={22} aria-hidden="true" /><span>IR Deck</span>
              <div className={styles.paperLines} aria-hidden="true"><i /><i /><i /></div>
              <small>2024년 매출</small><strong>95<span>억원</span></strong>
              <mark>IR_Deck_예시.pdf</mark>
            </div>
            <div className={`${styles.document} ${styles.auditDocument}`}>
              <FileText size={22} aria-hidden="true" /><span>재무제표</span>
              <div className={styles.paperLines} aria-hidden="true"><i /><i /><i /></div>
              <small>2024년 매출</small><strong>110<span>억원</span></strong>
              <mark>재무제표_예시.pdf</mark>
            </div>
          </div>
          <p className={styles.stageNote}>문서명과 원문 발췌로 출처를 확인</p>
        </div>
        <div className={styles.compareStage}>
          <p className={styles.eyebrow}>02 / COMPARE EVIDENCE</p>
          <h3>같은 지표를 대조하고</h3>
          <div className={styles.compareCard}>
            <p><GitCompareArrows size={17} aria-hidden="true" />2024년 매출 <span>상충</span></p>
            <dl className={styles.bars}>
              <div><dt>IR Deck</dt><dd><span className={styles.bar95} aria-hidden="true" /><strong>95억원</strong></dd></div>
              <div><dt>재무제표</dt><dd><span className={styles.bar110} aria-hidden="true" /><strong>110억원</strong></dd></div>
            </dl>
            <p className={styles.compareFoot}>값을 임의로 선택하지 않습니다</p>
          </div>
          <p className={styles.stageNote}>동일 기간 · 통화, 서로 다른 두 값</p>
        </div>
        <div className={styles.questionStage}>
          <p className={styles.eyebrow}>03 / NEXT REVIEW</p>
          <h3>다음 질문으로 연결</h3>
          <div className={styles.questionCard}>
            <MessageSquareText size={22} aria-hidden="true" />
            <span className={styles.questionLabel}>IC에서 확인할 질문</span>
            <p>어느 매출 값이 정본이며,<br />차이의 원인은 무엇입니까?</p>
            <div className={styles.questionDivider} />
            <small>확인 필요 자료</small>
            <strong>매출 명세 · 연결 범위</strong>
          </div>
          <p className={styles.stageNote}>확인할 질문과 필요한 자료를 함께</p>
        </div>
      </div>
    </figure>
  );
}

export function TrackVisual({ track }: { track: "vc" | "pe" }) {
  const steps = track === "vc"
    ? [["투자 논지", "왜 검토하는가"], ["근거 대조", "무엇에 기대는가"], ["IC 질문", "무엇을 확인할까"]]
    : [["재무 · QoE", "입력과 조정"], ["LBO · DD", "가정과 실사"], ["위원회 자료", "검토와 이력"]];
  return (
    <div className={`${styles.trackVisual} ${track === "pe" ? styles.peVisual : ""}`}>
      <div className={styles.trackTop}><span>{track === "vc" ? "VC / INVESTMENT THESIS" : "PE / DEAL REVIEW"}</span><span>업무 흐름</span></div>
      <ol>{steps.map(([title, desc], i) => <li key={title}>
        <span className={styles.stepNumber}>0{i + 1}</span><strong>{title}</strong><small>{desc}</small>
        {i < 2 && <ArrowRight className={styles.stepArrow} size={14} aria-hidden="true" />}
      </li>)}</ol>
    </div>
  );
}
