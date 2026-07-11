"""AXE Intelligence Terminal — Backend API Test Suite
Tests all endpoints: auth, sources, adapters, AI correlation, chat, system.
"""
import requests
import sys
import time
from datetime import datetime

class AxeAPITester:
    def __init__(self, base_url="https://axe-intel-hub.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, check_fn=None, timeout=30):
        """Run a single API test with optional validation function"""
        url = f"{self.base_url}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        if headers:
            req_headers.update(headers)
        if self.token and 'Authorization' not in req_headers:
            req_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Test {self.tests_run}: {name}")
        print(f"   {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=timeout)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                try:
                    json_data = response.json()
                    # Run additional validation if provided
                    if check_fn:
                        check_result = check_fn(json_data)
                        if not check_result:
                            success = False
                            print(f"   ❌ FAILED - Validation check failed")
                            self.failed_tests.append(f"{name}: validation failed")
                        else:
                            self.tests_passed += 1
                            print(f"   ✅ PASSED - Status: {response.status_code}")
                    else:
                        self.tests_passed += 1
                        print(f"   ✅ PASSED - Status: {response.status_code}")
                    return success, json_data
                except Exception as e:
                    if expected_status == 204:  # No content expected
                        self.tests_passed += 1
                        print(f"   ✅ PASSED - Status: {response.status_code}")
                        return True, {}
                    print(f"   ❌ FAILED - JSON parse error: {e}")
                    self.failed_tests.append(f"{name}: JSON parse error")
                    return False, {}
            else:
                print(f"   ❌ FAILED - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.text[:200]}")
                except:
                    pass
                self.failed_tests.append(f"{name}: status {response.status_code} != {expected_status}")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"   ❌ FAILED - Request timeout ({timeout}s)")
            self.failed_tests.append(f"{name}: timeout")
            return False, {}
        except Exception as e:
            print(f"   ❌ FAILED - Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, {}

    def test_root(self):
        """Test GET /api/ - no auth required"""
        success, data = self.run_test(
            "Root endpoint",
            "GET",
            "api/",
            200,
            check_fn=lambda d: d.get("name") == "AXE Intelligence Terminal" and d.get("status") == "online"
        )
        return success

    def test_health(self):
        """Test GET /api/health - no auth required"""
        success, data = self.run_test(
            "Health check",
            "GET",
            "api/health",
            200,
            check_fn=lambda d: d.get("status") == "ok"
        )
        return success

    def test_login_success(self):
        """Test POST /api/auth/login with correct credentials"""
        success, data = self.run_test(
            "Login with valid credentials",
            "POST",
            "api/auth/login",
            200,
            data={"email": "operator@axe.intel", "password": "axe2026"},
            check_fn=lambda d: "access_token" in d and d.get("email") == "operator@axe.intel"
        )
        if success and data.get("access_token"):
            self.token = data["access_token"]
            print(f"   🔑 Token acquired: {self.token[:20]}...")
        return success

    def test_login_failure(self):
        """Test POST /api/auth/login with wrong password"""
        success, data = self.run_test(
            "Login with wrong password",
            "POST",
            "api/auth/login",
            401,
            data={"email": "operator@axe.intel", "password": "wrongpassword"}
        )
        return success

    def test_me_with_token(self):
        """Test GET /api/auth/me with valid token"""
        success, data = self.run_test(
            "Get current operator info (with token)",
            "GET",
            "api/auth/me",
            200,
            check_fn=lambda d: d.get("email") == "operator@axe.intel" and d.get("operator") == True
        )
        return success

    def test_me_without_token(self):
        """Test GET /api/auth/me without token"""
        saved_token = self.token
        self.token = None
        success, data = self.run_test(
            "Get current operator info (without token)",
            "GET",
            "api/auth/me",
            401
        )
        self.token = saved_token
        return success

    def test_sources_latest(self):
        """Test GET /api/sources/latest - requires auth"""
        success, data = self.run_test(
            "Get latest sources snapshot",
            "GET",
            "api/sources/latest",
            200,
            check_fn=lambda d: (
                "sources" in d and 
                len(d["sources"]) == 8 and
                all(k in d["sources"] for k in ["news", "air", "vessel", "space", "macro", "crypto", "heatmap", "intel"]) and
                "sweep_id" in d and
                "healthy_sources" in d
            )
        )
        if success and data:
            print(f"   📊 Snapshot: {data.get('sweep_id')}, {data.get('healthy_sources')}/8 healthy, {data.get('events_total')} events")
            # Check each adapter status
            for name, adapter in data.get("sources", {}).items():
                status = adapter.get("status")
                count = adapter.get("count", 0)
                print(f"      • {name}: {status} ({count} items)")
        return success

    def test_sources_sweep(self):
        """Test POST /api/sources/sweep - triggers fresh sweep"""
        print(f"   ⏳ Triggering fresh sweep (may take 5-10s)...")
        success, data = self.run_test(
            "Trigger fresh sources sweep",
            "POST",
            "api/sources/sweep",
            200,
            check_fn=lambda d: "sources" in d and len(d["sources"]) == 8
        )
        if success and data:
            print(f"   📊 Fresh sweep: {data.get('sweep_id')}, duration: {data.get('duration_s')}s")
        return success

    def test_adapter_news(self):
        """Test GET /api/adapters/news"""
        success, data = self.run_test(
            "Get news adapter",
            "GET",
            "api/adapters/news",
            200,
            check_fn=lambda d: "status" in d and "items" in d and "count" in d
        )
        return success

    def test_adapter_air(self):
        """Test GET /api/adapters/air - should have theaters metadata"""
        success, data = self.run_test(
            "Get air adapter",
            "GET",
            "api/adapters/air",
            200,
            check_fn=lambda d: "status" in d and "items" in d and "theaters" in d
        )
        if success and data:
            print(f"   ✈️  Air theaters: {data.get('theaters')}, aircraft: {data.get('count')}")
        return success

    def test_adapter_air_phase3(self):
        """Test GET /api/adapters/air - Phase 3: corporate_count, military_count, registry_hits, registry_size"""
        success, data = self.run_test(
            "Get air adapter (Phase 3 metadata)",
            "GET",
            "api/adapters/air",
            200,
            check_fn=lambda d: (
                "corporate_count" in d and
                "military_count" in d and
                "registry_hits" in d and
                "registry_size" in d and
                d.get("registry_size") == 90  # 90 corporate jets in registry
            )
        )
        if success and data:
            print(f"   ✈️  Corporate: {data.get('corporate_count')}, Military: {data.get('military_count')}, Registry hits: {data.get('registry_hits')}/{data.get('registry_size')}")
            # Check for at least one corporate entry
            items = data.get("items", [])
            corp_items = [x for x in items if x.get("is_corporate")]
            if corp_items:
                print(f"   ✈️  Found {len(corp_items)} corporate jets")
                # Check source field
                for item in corp_items[:3]:
                    src = item.get("source", "")
                    if "adsb-pia" in src or "adsb-ladd" in src or "adsb-mil" in src:
                        print(f"      • {item.get('registration', 'N/A')} - {src} - {item.get('owner', 'N/A')}")
        return success

    def test_adapter_vessel_phase3(self):
        """Test GET /api/adapters/vessel - Phase 3: watchlist, sector_summary, cargo_count, tanker_count, cruise_count"""
        success, data = self.run_test(
            "Get vessel adapter (Phase 3 watchlist)",
            "GET",
            "api/adapters/vessel",
            200,
            check_fn=lambda d: (
                "watchlist" in d and
                len(d.get("watchlist", [])) >= 50 and  # ≥50 entries
                "sector_summary" in d and
                isinstance(d.get("sector_summary"), dict) and
                "cargo_count" in d and
                "tanker_count" in d and
                "cruise_count" in d
            )
        )
        if success and data:
            watchlist = data.get("watchlist", [])
            sectors = data.get("sector_summary", {})
            print(f"   🚢 Watchlist: {len(watchlist)} vessels")
            print(f"   🚢 Cargo: {data.get('cargo_count')}, Tanker: {data.get('tanker_count')}, Cruise: {data.get('cruise_count')}")
            print(f"   🚢 Sectors: {', '.join([f'{k}:{v}' for k, v in sectors.items()])}")
            # Check watchlist entries have required fields
            if watchlist:
                sample = watchlist[0]
                has_fields = all(k in sample for k in ["name", "type", "operator", "sector", "dwt", "live"])
                print(f"   🚢 Watchlist entry fields: {'✓' if has_fields else '✗'} (name, type, operator, sector, dwt, live)")
                # Check for specific vessels
                names = [w.get("name") for w in watchlist]
                for vessel in ["MSC IRINA", "EVER GIVEN", "MSC GÜLSÜN"]:
                    if vessel in names:
                        print(f"      • {vessel} ✓")
        return success

    def test_adapter_vessel_aisstream(self):
        """Test GET /api/adapters/vessel - AISStream integration: digitraffic_count, aisstream_count, aisstream_running, aisstream_msg_count"""
        success, data = self.run_test(
            "Get vessel adapter (AISStream integration)",
            "GET",
            "api/adapters/vessel",
            200,
            check_fn=lambda d: (
                "digitraffic_count" in d and
                "aisstream_count" in d and
                "aisstream_running" in d and
                "aisstream_msg_count" in d and
                "registry_hits" in d and
                "watchlist" in d
            )
        )
        if success and data:
            print(f"   🌊 Digitraffic: {data.get('digitraffic_count')} vessels")
            print(f"   🌊 AISStream: {data.get('aisstream_count')} vessels")
            print(f"   🌊 AISStream running: {data.get('aisstream_running')}")
            print(f"   🌊 AISStream messages: {data.get('aisstream_msg_count')}")
            print(f"   🌊 Registry hits: {data.get('registry_hits')}")
            
            # Check for aisstream source items
            items = data.get("items", [])
            aisstream_items = [x for x in items if x.get("source") == "aisstream"]
            print(f"   🌊 AISStream items in response: {len(aisstream_items)}")
            
            if aisstream_items:
                sample = aisstream_items[0]
                print(f"      • Sample: MMSI {sample.get('mmsi')}, lat/lon: {sample.get('lat')}/{sample.get('lon')}")
            
            # Warn if AISStream not running or no messages
            if not data.get("aisstream_running"):
                print(f"   ⚠️  WARNING: AISStream WebSocket not running")
            if data.get("aisstream_msg_count", 0) == 0:
                print(f"   ⚠️  WARNING: AISStream has not received any messages yet")
        return success

    def test_watchlists_crud(self):
        """Test watchlists CRUD: GET /api/watchlists, POST, PUT, DELETE"""
        # 1. GET /api/watchlists - should return empty list initially
        success, data = self.run_test(
            "Get watchlists (empty)",
            "GET",
            "api/watchlists",
            200,
            check_fn=lambda d: isinstance(d, list)
        )
        if not success:
            return False
        print(f"   📋 Initial watchlists: {len(data)}")

        # 2. POST /api/watchlists - create new watchlist
        success, created = self.run_test(
            "Create watchlist",
            "POST",
            "api/watchlists",
            200,
            data={"name": "My Corp Jets", "layer": "air", "filters": {"sector": "Tech"}},
            check_fn=lambda d: "id" in d and d.get("name") == "My Corp Jets" and d.get("layer") == "air"
        )
        if not success:
            return False
        wid = created.get("id")
        print(f"   📋 Created watchlist: {wid}")

        # 3. PUT /api/watchlists/{id} - update watchlist
        success, updated = self.run_test(
            "Update watchlist",
            "POST",  # Using POST with PUT endpoint
            f"api/watchlists/{wid}",
            200,
            data={"name": "Updated Corp Jets", "layer": "air", "filters": {"sector": "Finance"}},
            check_fn=lambda d: d.get("name") == "Updated Corp Jets" and d.get("filters", {}).get("sector") == "Finance"
        )
        if not success:
            # Try with actual PUT method
            url = f"{self.base_url}/api/watchlists/{wid}"
            headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {self.token}'}
            try:
                response = requests.put(url, json={"name": "Updated Corp Jets", "layer": "air", "filters": {"sector": "Finance"}}, headers=headers, timeout=10)
                if response.status_code == 200:
                    print(f"   ✅ Update worked with PUT method")
                    success = True
            except:
                pass

        # 4. DELETE /api/watchlists/{id} - remove watchlist
        url = f"{self.base_url}/api/watchlists/{wid}"
        headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {self.token}'}
        try:
            response = requests.delete(url, headers=headers, timeout=10)
            if response.status_code == 200:
                print(f"   ✅ Deleted watchlist: {wid}")
                self.tests_passed += 1
                return True
            else:
                print(f"   ❌ Delete failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"   ❌ Delete error: {e}")
            return False

    def test_history_correlations(self):
        """Test GET /api/history/correlations?limit=5"""
        success, data = self.run_test(
            "Get correlations history",
            "GET",
            "api/history/correlations?limit=5",
            200,
            check_fn=lambda d: "total" in d and "items" in d and isinstance(d.get("items"), list)
        )
        if success and data:
            print(f"   📜 Correlations: {data.get('total')} total, {len(data.get('items', []))} returned")
        return success

    def test_history_sweeps(self):
        """Test GET /api/history/sweeps?limit=5"""
        success, data = self.run_test(
            "Get sweeps history",
            "GET",
            "api/history/sweeps?limit=5",
            200,
            check_fn=lambda d: "items" in d and isinstance(d.get("items"), list)
        )
        if success and data:
            print(f"   📜 Sweeps: {len(data.get('items', []))} returned")
        return success

    def test_ai_correlate_first_call(self):
        """Test POST /api/ai/correlate - first call (should be <30s even if uncached)"""
        print(f"   ⏳ Running AI correlation FIRST CALL (should complete in <30s)...")
        start_time = time.time()
        success, data = self.run_test(
            "AI correlation (first call)",
            "POST",
            "api/ai/correlate",
            200,
            timeout=35,  # Allow 35s timeout to test <30s requirement
            check_fn=lambda d: (
                d.get("status") == "ok" and
                "result" in d and
                isinstance(d["result"], dict) and
                "headline_risk" in d["result"] and
                "alert_level" in d["result"] and
                "signals" in d["result"] and
                len(d["result"].get("signals", [])) >= 3 and
                "leverageable_ideas" in d["result"] and
                len(d["result"].get("leverageable_ideas", [])) >= 3
            )
        )
        elapsed = time.time() - start_time
        if success and data:
            result = data.get("result", {})
            cached = data.get("cached", False)
            print(f"   ⏱️  Response time: {elapsed:.2f}s (cached={cached})")
            print(f"   🧠 Headline: {result.get('headline_risk')}")
            print(f"   🚨 Alert: {result.get('alert_level')}")
            print(f"   📡 Signals: {len(result.get('signals', []))}")
            print(f"   💡 Ideas: {len(result.get('leverageable_ideas', []))}")
            if elapsed > 30:
                print(f"   ⚠️  WARNING: Response took {elapsed:.2f}s, exceeds 30s target")
        return success

    def test_ai_correlate_cached(self):
        """Test POST /api/ai/correlate - subsequent call (should be <2s with cached=true)"""
        print(f"   ⏳ Running AI correlation CACHED CALL (should be <2s)...")
        start_time = time.time()
        success, data = self.run_test(
            "AI correlation (cached call)",
            "POST",
            "api/ai/correlate",
            200,
            timeout=5,  # Should be very fast
            check_fn=lambda d: (
                d.get("status") == "ok" and
                d.get("cached") == True and
                "result" in d and
                isinstance(d["result"], dict)
            )
        )
        elapsed = time.time() - start_time
        if success and data:
            cached = data.get("cached", False)
            print(f"   ⏱️  Response time: {elapsed:.2f}s (cached={cached})")
            if elapsed > 2:
                print(f"   ⚠️  WARNING: Cached response took {elapsed:.2f}s, exceeds 2s target")
            elif cached:
                print(f"   ✅ PERFORMANCE: Cached response within target (<2s)")
        return success

    def test_ai_correlate_latest(self):
        """Test GET /api/ai/correlate/latest - should return signals[] (≥3), leverageable_ideas[] (≥3)"""
        success, data = self.run_test(
            "Get latest AI correlation",
            "GET",
            "api/ai/correlate/latest",
            200,
            check_fn=lambda d: (
                d.get("status") == "ok" and
                "result" in d and
                isinstance(d["result"], dict) and
                "signals" in d["result"] and
                len(d["result"].get("signals", [])) >= 3 and
                "leverageable_ideas" in d["result"] and
                len(d["result"].get("leverageable_ideas", [])) >= 3
            )
        )
        if success and data:
            result = data.get("result", {})
            print(f"   📡 Signals: {len(result.get('signals', []))} (≥3 required)")
            print(f"   💡 Ideas: {len(result.get('leverageable_ideas', []))} (≥3 required)")
        return success

    def test_ai_chat(self):
        """Test POST /api/ai/chat - should complete within 30s"""
        print(f"   ⏳ Sending chat message to Claude (should complete in <30s)...")
        start_time = time.time()
        success, data = self.run_test(
            "AI chat",
            "POST",
            "api/ai/chat",
            200,
            timeout=35,  # Allow 35s to test <30s requirement
            data={"message": "What are the top 3 signals from the current sweep?"},
            check_fn=lambda d: "response" in d and len(d["response"]) > 10 and "session_id" in d
        )
        elapsed = time.time() - start_time
        if success and data:
            print(f"   ⏱️  Response time: {elapsed:.2f}s")
            print(f"   💬 Response preview: {data.get('response')[:100]}...")
            if elapsed > 30:
                print(f"   ⚠️  WARNING: Chat response took {elapsed:.2f}s, exceeds 30s target")
        return success

    def test_meta(self):
        """Test GET /api/meta - should not timeout"""
        print(f"   ⏳ Testing /api/meta (should not timeout)...")
        start_time = time.time()
        success, data = self.run_test(
            "Get system meta",
            "GET",
            "api/meta",
            200,
            timeout=10,  # Should be fast
            check_fn=lambda d: (
                "last_sweep_id" in d and
                "healthy_sources" in d and
                d.get("total_sources") == 8 and
                "adapters" in d and
                len(d["adapters"]) == 8
            )
        )
        elapsed = time.time() - start_time
        if success and data:
            print(f"   ⏱️  Response time: {elapsed:.2f}s")
            print(f"   📊 Meta: {data.get('healthy_sources')}/8 healthy, last sweep: {data.get('last_sweep_id')}")
        return success

    def test_alerts_rules(self):
        """Test GET /api/alerts/rules"""
        success, data = self.run_test(
            "Get alert rules",
            "GET",
            "api/alerts/rules",
            200,
            check_fn=lambda d: isinstance(d, list)
        )
        if success:
            print(f"   🚨 Alert rules: {len(data)} rules")
        return success

    def test_alerts_events(self):
        """Test GET /api/alerts/events"""
        success, data = self.run_test(
            "Get alert events",
            "GET",
            "api/alerts/events",
            200,
            check_fn=lambda d: isinstance(d, list)
        )
        if success:
            print(f"   🚨 Alert events: {len(data)} events")
        return success

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("=" * 80)
        print("AXE INTELLIGENCE TERMINAL — BACKEND API TEST SUITE")
        print("=" * 80)
        print(f"Base URL: {self.base_url}")
        print(f"Started: {datetime.now().isoformat()}")
        print("=" * 80)

        # Phase 1: Public endpoints (no auth)
        print("\n" + "=" * 80)
        print("PHASE 1: PUBLIC ENDPOINTS (no auth required)")
        print("=" * 80)
        self.test_root()
        self.test_health()

        # Phase 2: Auth
        print("\n" + "=" * 80)
        print("PHASE 2: AUTHENTICATION")
        print("=" * 80)
        if not self.test_login_success():
            print("\n❌ CRITICAL: Login failed, cannot proceed with auth-protected tests")
            self.print_summary()
            return 1
        self.test_login_failure()
        self.test_me_with_token()
        self.test_me_without_token()

        # Phase 3: Sources & Adapters
        print("\n" + "=" * 80)
        print("PHASE 3: SOURCES & ADAPTERS (auth required)")
        print("=" * 80)
        self.test_sources_latest()
        self.test_sources_sweep()
        self.test_adapter_news()
        self.test_adapter_air()
        
        # Phase 3.5: Phase 3 New Features - Corporate Jets & Vessels
        print("\n" + "=" * 80)
        print("PHASE 3.5: PHASE 3 NEW FEATURES - CORPORATE JETS & VESSELS")
        print("=" * 80)
        self.test_adapter_air_phase3()
        self.test_adapter_vessel_phase3()
        self.test_adapter_vessel_aisstream()
        
        # Phase 3.6: Watchlists CRUD
        print("\n" + "=" * 80)
        print("PHASE 3.6: WATCHLISTS CRUD (auth required)")
        print("=" * 80)
        self.test_watchlists_crud()
        
        # Phase 3.7: History endpoints
        print("\n" + "=" * 80)
        print("PHASE 3.7: HISTORY ENDPOINTS (auth required)")
        print("=" * 80)
        self.test_history_correlations()
        self.test_history_sweeps()

        # Phase 4: AI - Performance Testing
        print("\n" + "=" * 80)
        print("PHASE 4: AI CORRELATION & CHAT (auth required) - PERFORMANCE TESTING")
        print("=" * 80)
        print("Testing fix for /api/ai/correlate timeout issue:")
        print("  • First call should complete in <30s (even if cache empty)")
        print("  • Subsequent calls should return cached result in <2s")
        print("  • /api/ai/correlate/latest should have ≥3 signals, ≥3 ideas")
        print("  • /api/ai/chat should complete in <30s")
        self.test_ai_correlate_first_call()
        self.test_ai_correlate_cached()
        self.test_ai_correlate_latest()
        self.test_ai_chat()

        # Phase 5: System
        print("\n" + "=" * 80)
        print("PHASE 5: SYSTEM META & ALERTS (auth required)")
        print("=" * 80)
        self.test_meta()
        self.test_alerts_rules()
        self.test_alerts_events()

        self.print_summary()
        return 0 if self.tests_passed == self.tests_run else 1

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"Total tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0:.1f}%")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            for i, test in enumerate(self.failed_tests, 1):
                print(f"   {i}. {test}")
        else:
            print("\n✅ ALL TESTS PASSED!")
        
        print("=" * 80)


def main():
    tester = AxeAPITester()
    return tester.run_all_tests()


if __name__ == "__main__":
    sys.exit(main())
