import os
from sqlalchemy import create_mock_engine
from app.models import Base

def dump_sql(sql, *multiparams, **params):
    # This function receives the generated SQL
    with open("reports/artifacts/P1_SCHEMA_MIGRATION_V2.sql", "a", encoding="utf-8") as f:
        f.write(str(sql.compile(dialect=engine.dialect)).strip() + ";\n")

if __name__ == "__main__":
    os.makedirs("reports/artifacts", exist_ok=True)
    
    # Ensure the file is empty before starting
    with open("reports/artifacts/P1_SCHEMA_MIGRATION_V2.sql", "w", encoding="utf-8") as f:
        f.write("-- AegisGraph AI: Phase 1 Multi-Tenant Schema (PostgreSQL)\n\n")

    # Create a mock engine that routes its output to dump_sql
    engine = create_mock_engine('postgresql://', dump_sql)
    
    # Dump the create all statement
    Base.metadata.create_all(engine, checkfirst=False)
    
    print("SQL schema written to reports/artifacts/P1_SCHEMA_MIGRATION_V2.sql")
