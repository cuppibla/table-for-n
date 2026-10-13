"""pytest runs from the repo root: the lab's modules import as `host`,
`metrics`, `world`, and .env is read the way the kitchen reads it."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kitchen import env  # noqa: E402,F401  — settles GOOGLE_* from .env / gcloud
