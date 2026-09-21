import pytest
import os
import json
from app.services.graph_service import GraphService


pytestmark = pytest.mark.asyncio

@pytest.fixture
def graph_service():
    service = GraphService()
    yield service
    service.close()


async def test_multitenancy_isolation(graph_service: GraphService):
    company_a = "TATA-JAMSHEDPUR"
    company_b = "TATA-PUNE"
    
    # Generate 50 rules for A and 50 for B
    rules_a = [{"rule_id": f"R-A-{i}", "text": f"Rule A {i}", "section": "Emergency", "subcategory": "Fire"} for i in range(50)]
    rules_b = [{"rule_id": f"R-B-{i}", "text": f"Rule B {i}", "section": "Emergency", "subcategory": "Spill"} for i in range(50)]
    
    # Clear graph initially to ensure clean state
    # Use internal batching
    resp_a = graph_service.batch_ingest(company_code=company_a, manual_metadata={"manual_id": "MANUAL-A"}, rules=rules_a, clear_existing=True)
    resp_b = graph_service.batch_ingest(company_code=company_b, manual_metadata={"manual_id": "MANUAL-B"}, rules=rules_b, clear_existing=True)

    # 1. Fetch rules for Company A, ensure 0 from Company B
    fetch_a = graph_service._fetch_rules_for_section(company_a, "Emergency")
    assert len(fetch_a) == 50
    for rule in fetch_a:
        assert rule["id"].startswith("R-A-")
        assert not rule["id"].startswith("R-B-")

    # 2. Fetch rules for Company B, ensure 0 from Company A
    fetch_b = graph_service._fetch_rules_for_section(company_b, "Emergency")
    assert len(fetch_b) == 50
    for rule in fetch_b:
        assert rule["id"].startswith("R-B-")
        assert not rule["id"].startswith("R-A-")
        
    # Generate DCWGT Dataset ensures boundaries are maintained
    ds_a, latency = graph_service.generate_constrained_dataset(company_a, {"Emergency": 50})
    assert len(ds_a) == 50
    
    # Save the audit report
    audit_data = {
        "status": "PASS",
        "companies_tested": [company_a, company_b],
        "isolation_verified": True,
        "company_a_records_returned": len(fetch_a),
        "company_b_records_returned": len(fetch_b),
        "cross_tenant_spillage_detected": False,
        "latency_ms": latency
    }
    
    os.makedirs("reports/artifacts", exist_ok=True)
    with open("reports/artifacts/P1_TENANT_ISOLATION_AUDIT.json", "w") as f:
        json.dump(audit_data, f, indent=4)
        
    assert os.path.exists("reports/artifacts/P1_TENANT_ISOLATION_AUDIT.json")
