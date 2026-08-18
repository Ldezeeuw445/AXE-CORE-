import requests
import json

BASE = "https://axe-intel-hub.preview.emergentagent.com/api"

# Login
print("1. Login...")
r = requests.post(f"{BASE}/auth/login", json={"email": "operator@axe.intel", "password": "axe2026"}, timeout=10)
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"   ✓ Token: {token[:20]}...")

# Test air adapter Phase 3
print("\n2. GET /api/adapters/air (Phase 3)...")
r = requests.get(f"{BASE}/adapters/air", headers=headers, timeout=15)
data = r.json()
print(f"   Status: {r.status_code}")
print(f"   corporate_count: {data.get('corporate_count')}")
print(f"   military_count: {data.get('military_count')}")
print(f"   registry_hits: {data.get('registry_hits')}")
print(f"   registry_size: {data.get('registry_size')}")
items = data.get("items", [])
corp = [x for x in items if x.get("is_corporate")]
print(f"   Corporate items: {len(corp)}")
if corp:
    for c in corp[:3]:
        print(f"      • {c.get('registration')} - {c.get('source')} - {c.get('owner', 'N/A')}")

# Test vessel adapter Phase 3
print("\n3. GET /api/adapters/vessel (Phase 3)...")
r = requests.get(f"{BASE}/adapters/vessel", headers=headers, timeout=15)
data = r.json()
print(f"   Status: {r.status_code}")
print(f"   watchlist entries: {len(data.get('watchlist', []))}")
print(f"   cargo_count: {data.get('cargo_count')}")
print(f"   tanker_count: {data.get('tanker_count')}")
print(f"   cruise_count: {data.get('cruise_count')}")
print(f"   sector_summary: {data.get('sector_summary')}")
watchlist = data.get("watchlist", [])
if watchlist:
    sample = watchlist[0]
    print(f"   Sample entry keys: {list(sample.keys())}")
    # Check for specific vessels
    names = [w.get("name") for w in watchlist]
    for vessel in ["MSC IRINA", "EVER GIVEN", "MSC GÜLSÜN"]:
        print(f"      • {vessel}: {'✓' if vessel in names else '✗'}")

# Test watchlists
print("\n4. GET /api/watchlists...")
r = requests.get(f"{BASE}/watchlists", headers=headers, timeout=10)
print(f"   Status: {r.status_code}, Count: {len(r.json())}")

print("\n5. POST /api/watchlists...")
r = requests.post(f"{BASE}/watchlists", json={"name": "Test Jets", "layer": "air", "filters": {"sector": "Tech"}}, headers=headers, timeout=10)
print(f"   Status: {r.status_code}")
if r.status_code == 200:
    wid = r.json()["id"]
    print(f"   Created: {wid}")
    
    print("\n6. DELETE /api/watchlists/{id}...")
    r = requests.delete(f"{BASE}/watchlists/{wid}", headers=headers, timeout=10)
    print(f"   Status: {r.status_code}")

# Test history
print("\n7. GET /api/history/correlations?limit=3...")
r = requests.get(f"{BASE}/history/correlations?limit=3", headers=headers, timeout=10)
data = r.json()
print(f"   Status: {r.status_code}")
print(f"   Total: {data.get('total')}, Items: {len(data.get('items', []))}")

print("\n8. GET /api/history/sweeps?limit=3...")
r = requests.get(f"{BASE}/history/sweeps?limit=3", headers=headers, timeout=10)
data = r.json()
print(f"   Status: {r.status_code}")
print(f"   Items: {len(data.get('items', []))}")

print("\n✅ All Phase 3 backend tests completed!")
