"""Deliverable kits — the products the trading_tools cluster actually sells.

The rest of `revenue/` decides *what* to sell and *where* to post it. This
package is the thing that arrives in the buyer's inbox:

* `journal.py`  — broker CSV in, descriptive report out (the $149 stack rung,
  and the free version of it is the strongest `free_tool` asset there is)
* `propfirm.py` — challenge rule arithmetic and position sizing (the $19
  tripwire)

Both are stdlib-only and offline: they run on a buyer's laptop, and neither
sends their trade data anywhere. That last property is worth stating on the
sales page — it is the objection everyone has.

Neither module gives trading advice. They compute facts about numbers the user
supplied. That line is not decoration: crossing it makes this licensed activity
under MiFID II / RIA rules.
"""

from . import journal, propfirm  # noqa: F401

__all__ = ["journal", "propfirm"]
