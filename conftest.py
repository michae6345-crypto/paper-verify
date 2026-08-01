"""Put `backend/` on sys.path so tests can `import pv...` without each file
hacking sys.path itself. Orchestrator-owned.
"""

import sys
from pathlib import Path

BACKEND = Path(__file__).parent / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
