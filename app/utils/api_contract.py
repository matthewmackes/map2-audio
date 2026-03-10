from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute

HTTP_METHODS = {"delete", "get", "head", "options", "patch", "post", "put", "trace"}

API_ERROR_SCHEMA = {
    "title": "ApiError",
    "type": "object",
    "required": ["error"],
    "properties": {
        "error": {
            "type": "object",
            "required": ["code", "message"],
            "properties": {
                "code": {"type": "string", "description": "Stable machine-readable error code."},
                "message": {"type": "string", "description": "Human-readable summary."},
                "details": {
                    "anyOf": [
                        {"type": "object"},
                        {"type": "array"},
                        {"type": "string"},
                        {"type": "null"},
                    ],
                    "description": "Optional structured details for operators or clients.",
                },
            },
        }
    },
}

ERROR_RESPONSE_TEMPLATES = {
    "500": {
        "description": "Internal server error",
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/ApiError"},
                "examples": {
                    "internal_error": {
                        "summary": "Generic internal error",
                        "value": {
                            "error": {
                                "code": "internal_error",
                                "message": "Internal server error",
                                "details": None,
                            }
                        },
                    }
                },
            }
        },
    },
    "503": {
        "description": "Service unavailable or dependency not ready",
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/ApiError"},
                "examples": {
                    "service_unavailable": {
                        "summary": "Dependency unavailable",
                        "value": {
                            "error": {
                                "code": "service_unavailable",
                                "message": "Required service or device is unavailable",
                                "details": None,
                            }
                        },
                    }
                },
            }
        },
    },
}


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip("/"))
    return slug.strip("_") or "root"


def generate_operation_id(route: APIRoute) -> str:
    methods = "_".join(sorted(method.lower() for method in route.methods or [] if method != "HEAD")) or "route"
    module_name = getattr(route.endpoint, "__module__", "unknown").split(".")[-1]
    route_name = getattr(route, "name", "route")
    return f"{module_name}_{route_name}_{methods}_{_slug(route.path_format)}"


def apply_contract_rules(schema: dict[str, Any]) -> dict[str, Any]:
    components = schema.setdefault("components", {})
    schemas = components.setdefault("schemas", {})
    schemas.setdefault("ApiError", deepcopy(API_ERROR_SCHEMA))

    for path_item in schema.get("paths", {}).values():
        for method, operation in path_item.items():
            if method not in HTTP_METHODS:
                continue
            responses = operation.setdefault("responses", {})
            for status_code, template in ERROR_RESPONSE_TEMPLATES.items():
                responses.setdefault(status_code, deepcopy(template))
    return schema


def install_contract_openapi(app: FastAPI) -> None:
    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema is not None:
            return app.openapi_schema
        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        app.openapi_schema = apply_contract_rules(schema)
        return app.openapi_schema

    app.openapi = custom_openapi
