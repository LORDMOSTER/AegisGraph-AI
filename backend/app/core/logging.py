import logging

LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


def configure_logging() -> None:
    """Configure root logger for the entire application."""
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
