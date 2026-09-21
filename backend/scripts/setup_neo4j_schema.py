import os
import sys
import logging
from neo4j import GraphDatabase

# Ensure backend root is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("neo4j_schema_setup")


def setup_schema():
    """
    Enforces multi-tenant schema constraints and indexing on the Neo4j database.
    """
    uri = settings.neo4j_uri
    user = settings.neo4j_user
    password = settings.neo4j_password

    logger.info(f"Connecting to Neo4j at {uri}...")

    queries = [
        "CREATE CONSTRAINT company_code_unique IF NOT EXISTS FOR (c:Company) REQUIRE c.company_code IS UNIQUE;",
        "CREATE CONSTRAINT rule_id_unique IF NOT EXISTS FOR (r:Rule) REQUIRE r.rule_id IS UNIQUE;",
        "CREATE INDEX rule_properties IF NOT EXISTS FOR (r:Rule) ON (r.risk_score, r.cognitive_level, r.is_active);",
        "CREATE INDEX manual_company IF NOT EXISTS FOR (m:Manual) ON (m.company_code);",
        "CREATE INDEX section_name IF NOT EXISTS FOR (s:Section) ON (s.name);",
        "CREATE INDEX subcategory_name IF NOT EXISTS FOR (sc:SubCategory) ON (sc.name);"
    ]

    try:
        with GraphDatabase.driver(uri, auth=(user, password)) as driver:
            with driver.session() as session:
                for query in queries:
                    logger.info(f"Executing: {query}")
                    session.run(query)
        logger.info("Neo4j schema constraints and indices applied successfully.")
    except Exception as e:
        logger.error(f"Failed to apply Neo4j schema: {e}")
        sys.exit(1)


if __name__ == "__main__":
    setup_schema()
