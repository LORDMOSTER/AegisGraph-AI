import asyncio
import httpx
import os

EXPECTED = [
    {"name": "Arjun", "issue_date": "2024-03-15", "expiry_date": "2026-03-14", "score": 88},
    {"name": "Priya", "issue_date": "2025-10-02", "expiry_date": "2026-10-09", "score": 42},
    {"name": "Vignesh", "issue_date": "2024-11-11", "expiry_date": "2026-11-10", "score": 91},
    {"name": "Karthik", "issue_date": "2026-01-05", "expiry_date": "2028-01-04", "score": 94.5},
    {"name": "Divya", "issue_date": "2023-07-28", "expiry_date": "2025-07-28", "score": None},
    {"name": "Mohammed", "issue_date": "2025-10-21", "expiry_date": "2026-10-20", "score": 76}
]

async def main():
    print("Starting Automated Test Harness for Certificates Analysis...")
    files = [f for f in os.listdir("test_certificates") if f.endswith(".pdf")]
    
    if not files:
        print("No PDFs found in test_certificates/. Please add samples to test.")
        return

    async with httpx.AsyncClient() as client:
        for ex in EXPECTED:
            # find matching file loosely
            target_file = next((f for f in files if ex["name"].lower() in f.lower()), None)
            if not target_file:
                print(f"Skipping {ex['name']} - file not found.")
                continue
                
            file_path = os.path.join("test_certificates", target_file)
            print(f"\nAnalyzing {target_file}...")
            
            with open(file_path, "rb") as f:
                res = await client.post("http://localhost:8000/api/v1/certificates/analyze", files={"file": f})
                if res.status_code != 200:
                    print(f"FAILED {ex['name']} - Status {res.status_code}: {res.text}")
                    continue
                    
                data = res.json()
                
                # Assertions
                name_match = ex["name"].lower() in str(data.get("holder_name") or "").lower()
                issue_match = str(data.get("issue_date")) == str(ex["issue_date"])
                expiry_match = str(data.get("expiry_date")) == str(ex["expiry_date"])
                
                if not name_match:
                    print(f"✗ Name mismatch: Expected {ex['name']}, got {data.get('holder_name')}")
                if not issue_match:
                    print(f"✗ Issue date mismatch: Expected {ex['issue_date']}, got {data.get('issue_date')}")
                    assert False, "Date extraction failed!"
                if not expiry_match:
                    print(f"✗ Expiry date mismatch: Expected {ex['expiry_date']}, got {data.get('expiry_date')}")
                    assert False, "Date extraction failed!"
                    
                print(f"✓ {ex['name']} passed date assertions.")

if __name__ == "__main__":
    asyncio.run(main())
