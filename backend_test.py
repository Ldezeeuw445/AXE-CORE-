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

    def test_ai_correlate(self):
        """Test POST /api/ai/correlate - Claude correlation"""
        print(f"   ⏳ Running AI correlation (may take 10-20s)...")
        success, data = self.run_test(
            "AI correlation",
            "POST",
            "api/ai/correlate",
            200,
            timeout=60,  # AI correlation can take longer
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
        if success and data:
            result = data.get("result", {})
            print(f"   🧠 Headline: {result.get('headline_risk')}")
            print(f"   🚨 Alert: {result.get('alert_level')}")
            print(f"   📡 Signals: {len(result.get('signals', []))}")
            print(f"   💡 Ideas: {len(result.get('leverageable_ideas', []))}")
        return success

    def test_ai_correlate_latest(self):
        """Test GET /api/ai/correlate/latest"""
        success, data = self.run_test(
            "Get latest AI correlation",
            "GET",
            "api/ai/correlate/latest",
            200,
            check_fn=lambda d: d.get("status") in ["ok", "none"]
        )
        return success

    def test_ai_chat(self):
        """Test POST /api/ai/chat"""
        print(f"   ⏳ Sending chat message to Claude (may take 5-10s)...")
        success, data = self.run_test(
            "AI chat",
            "POST",
            "api/ai/chat",
            200,
            timeout=45,  # AI chat can take longer
            data={"message": "What are the top 3 signals from the current sweep?"},
            check_fn=lambda d: "response" in d and len(d["response"]) > 10 and "session_id" in d
        )
        if success and data:
            print(f"   💬 Response preview: {data.get('response')[:100]}...")
        return success

    def test_meta(self):
        """Test GET /api/meta"""
        success, data = self.run_test(
            "Get system meta",
            "GET",
            "api/meta",
            200,
            check_fn=lambda d: (
                "last_sweep_id" in d and
                "healthy_sources" in d and
                d.get("total_sources") == 8 and
                "adapters" in d and
                len(d["adapters"]) == 8
            )
        )
        if success and data:
            print(f"   📊 Meta: {data.get('healthy_sources')}/8 healthy, last sweep: {data.get('last_sweep_id')}")
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

        # Phase 4: AI
        print("\n" + "=" * 80)
        print("PHASE 4: AI CORRELATION & CHAT (auth required)")
        print("=" * 80)
        self.test_ai_correlate()
        self.test_ai_correlate_latest()
        self.test_ai_chat()

        # Phase 5: System
        print("\n" + "=" * 80)
        print("PHASE 5: SYSTEM META (auth required)")
        print("=" * 80)
        self.test_meta()

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
