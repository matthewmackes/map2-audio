from app.utils.api_contract import apply_contract_rules, generate_operation_id


class _Endpoint:
    __module__ = "app.routes.test_module"


class _Route:
    methods = {"GET"}
    name = "get_status"
    path_format = "/api/test/status"
    endpoint = _Endpoint()


def test_generate_operation_id_is_stable_and_path_aware():
    route = _Route()
    assert generate_operation_id(route) == "test_module_get_status_get_api_test_status"


def test_apply_contract_rules_injects_error_schema_and_responses():
    schema = {
        "paths": {
            "/api/test/status": {
                "get": {
                    "responses": {
                        "200": {"description": "ok"}
                    }
                }
            }
        }
    }

    updated = apply_contract_rules(schema)

    responses = updated["paths"]["/api/test/status"]["get"]["responses"]
    assert "500" in responses
    assert "503" in responses
    assert "ApiError" in updated["components"]["schemas"]
