# DealSync Python Report Engine (Dr. Cell)

Cloud Agent PR [#3](https://github.com/vcwoong-ai/vcwoong/pull/3)에서 생성된 **Python 기반 보고서 생성 엔진**입니다.

Next.js 앱(`src/agents/bio-agent.ts`)과 별도로, CLI/배치 분석용으로 사용할 수 있습니다.

## 구성

| 경로 | 설명 |
|------|------|
| `agents/bio_agent.py` | Dr. Cell — rNPV, 임상 파이프라인 분석 |
| `agents/base.py` | 에이전트 베이스 클래스 |
| `agents/registry.py` | 섹터별 에이전트 레지스트리 |
| `engine.py` | 보고서 생성 오케스트레이터 |
| `classification/sector_classifier.py` | 섹터 자동 분류 |
| `models/report.py` | 보고서 데이터 모델 |
| `prompts/templates/bio.yaml` | BIO 섹터 프롬프트 템플릿 |

## 실행 (로컬)

```bash
cd engine/python
pip install -r requirements.txt
pytest tests/   # 전체 테스트는 bio 브랜치 참고
```

## 소스 브랜치

`cursor/bio-sector-agent-dr-cell-8202` — 전체 파일(테스트 포함)은 GitHub에서 확인하세요.
