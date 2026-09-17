"""NorthSea Commodity Partners -- de remote MCP-facade binnen AXE CORE.

MCP is hier een INTERFACE. De bedrijfsregels staan in `service.py` (de gedeelde
NorthSea-servicelaag), de data in AXE Commodities (Supabase), de verzendregels in
de bestaande edge function `send-approved-reply`. De MCP-handlers in `server.py`
zijn dun: scope controleren, begrenzen, de service aanroepen, auditen.

Zie docs/ARCHITECTURE.md.
"""

__version__ = "1.4.0"
