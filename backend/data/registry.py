"""Re-export registries from data/__init__.py and vessels_registry.py."""
from .vessels_registry import HIGH_IMPACT_VESSELS, BY_MMSI as VESSEL_BY_MMSI, sector_summary as vessel_sector_summary  # noqa: F401
