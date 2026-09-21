import json
import logging
from pathlib import Path
from typing import Any, Dict, List
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Database connection parameters
import os
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_AUTH = (os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "tigertiger"))


class SafetyGraphIngestor:
    """Handles the parsing and ingestion of safety rules into Neo4j."""

    def __init__(self, uri: str, auth: tuple):
        self.driver = GraphDatabase.driver(uri, auth=auth)

    def close(self):
        """Closes the database driver connection."""
        self.driver.close()

    def verify_connection(self):
        """Verifies the connection to the Neo4j database."""
        self.driver.verify_connectivity()

    def load_json_data(self, file_path: str) -> List[Dict[str, Any]]:
        """Loads the safety rules from a local JSON file."""
        path = Path(file_path)
        if not path.exists():
            logger.error(f"Data file not found at path: {file_path}")
            raise FileNotFoundError(f"Missing file: {file_path}")

        with path.open('r', encoding='utf-8') as f:
            data = json.load(f)
            logger.info(f"Loaded {len(data)} rule(s) from {file_path}")
            return data

    def clear_database(self):
        """Removes all existing nodes and relationships."""
        query = "MATCH (n) DETACH DELETE n"
        self.driver.execute_query(query)
        logger.info("Cleared existing database graph data.")

    def ingest_rules(self, rules_data: List[Dict[str, Any]]):
        """Maps the JSON objects into interconnected graph nodes and edges."""
        cypher_query = """
        UNWIND $rules AS row
        MERGE (s:Section {name: row.section})
        MERGE (sc:SubCategory {name: row.sub_category})
        MERGE (sc)-[:PART_OF]->(s)
        MERGE (r:Rule {id: row.id})
        SET r.text = row.rule
        MERGE (r)-[:BELONGS_TO]->(sc)
        """
        self.driver.execute_query(cypher_query, rules=rules_data, database_="neo4j")
        logger.info("Graph nodes and edges successfully mapped and ingested.")


def main():
    data_file = "safety_data.json"
    ingestor = None

    try:
        logger.info("Initializing graph ingestion sequence...")
        ingestor = SafetyGraphIngestor(NEO4J_URI, NEO4J_AUTH)
        
        ingestor.verify_connection()
        
        rules = ingestor.load_json_data(data_file)
        if rules:
            ingestor.clear_database()
            ingestor.ingest_rules(rules)
            logger.info("Ingestion pipeline completed successfully.")

    except ServiceUnavailable:
        logger.error("Failed to connect to Neo4j. Ensure the local database instance is active.")
    except Exception as e:
        logger.exception(f"An unexpected error occurred during ingestion: {e}")
    finally:
        if ingestor:
            ingestor.close()


if __name__ == "__main__":
    main()
