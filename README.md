# vcwoong — Report Generation Engine

A sector-aware report generation engine that routes input context to specialised
sector agents.  Each agent applies domain-specific prompt instructions and
post-processing rules before returning a structured report.

## Supported sector agents

| Agent name | Sector key(s)         | Class |
|------------|-----------------------|-------|
| Dr. Cell   | `bio`, `healthcare`   | `BioSectorAgent` |

## Quick start

```bash
pip install -r requirements.txt
python -m src.engine --help
```

### Programmatic usage

```python
from src.engine import ReportEngine

engine = ReportEngine()
report = engine.generate(
    company_name="BioPharma Co.",
    description="Clinical-stage oncology company with three Ph2 assets.",
    raw_data={
        "pipeline": [...],
        "financials": {...},
    },
)
print(report.to_markdown())
```

## Running tests

```bash
pytest tests/ -v --cov=src
```

## Architecture

```
src/
├── engine.py                  # ReportEngine orchestrator
├── classification/
│   └── sector_classifier.py   # Keyword/rule-based sector detection
├── agents/
│   ├── base.py                # BaseSectorAgent ABC
│   ├── registry.py            # Agent registration & lookup
│   └── bio_agent.py           # Dr. Cell — BIO/healthcare sector agent
├── prompts/
│   ├── builder.py             # Prompt assembly helpers
│   └── templates/
│       ├── base.yaml          # Shared system-prompt skeleton
│       └── bio.yaml           # BIO-sector additional instructions
└── models/
    ├── report.py              # Report, Section, PipelineAsset, rNPV models
    └── context.py             # SectorContext input model
```
