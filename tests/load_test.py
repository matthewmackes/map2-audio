"""
Locust load test for cluster endpoints (Phase 5.1)

Run with:
  locust -f tests/load_test.py
"""

try:
    from locust import HttpUser, task, between
except ModuleNotFoundError:
    import pytest
    pytest.skip("locust not installed; skipping load test module", allow_module_level=True)


class ClusterApiUser(HttpUser):
    wait_time = between(0.5, 2.0)

    @task(3)
    def get_cluster_nodes(self):
        self.client.get("/api/cluster/nodes")

    @task(3)
    def get_flow_assignments(self):
        self.client.get("/api/cluster/flows/assignments")

    @task(1)
    def get_chain_list(self):
        self.client.get("/api/chains")
