#!/usr/bin/env python3
import sys
sys.path.insert(0, '/home/workspace/celestara-campaign/backend')

from main import ConsistencyReport, LoreConsistencyIssue

# Test creating ConsistencyReport manually
issues = [
    LoreConsistencyIssue(
        id="test-1",
        severity="warning",
        category="Missing Content",
        message="Test issue",
        actionable=True,
        suggested_action="Fix it"
    )
]

summary = {
    "total_issues": 1,
    "error": 0,
    "warning": 1,
    "info": 0,
    "by_category": {"Missing Content": 1}
}

report = ConsistencyReport(
    issues=issues,
    summary=summary,
    timestamp="2024-01-01T00:00:00Z",
    total_entities_checked=10
)

print("ConsistencyReport created successfully!")
print(report.model_dump())

