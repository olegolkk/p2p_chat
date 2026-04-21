"""
Настройка логирования для приложения
"""

import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    """Настраивает логирование для всего приложения"""

    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )