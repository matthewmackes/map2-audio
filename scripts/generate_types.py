#!/usr/bin/env python3
"""
TypeScript Type Generator
Generates TypeScript interfaces from Pydantic models.
Run this script to keep web/src/map2/types.ts in sync with backend models.

Usage: python scripts/generate_types.py > web/src/map2/generated-types.ts
"""

import ast
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set

# Type mapping from Python to TypeScript
PYTHON_TO_TS: Dict[str, str] = {
    "str": "string",
    "int": "number",
    "float": "number",
    "bool": "boolean",
    "None": "null",
    "Any": "unknown",
    "dict": "Record<string, unknown>",
    "Dict": "Record<string, unknown>",
}


def python_type_to_ts(type_str: str) -> str:
    """Convert Python type annotation to TypeScript type."""
    type_str = type_str.strip()

    # Handle Optional[X]
    if type_str.startswith("Optional["):
        inner = type_str[9:-1]
        return f"{python_type_to_ts(inner)} | null"

    # Handle List[X]
    if type_str.startswith("List["):
        inner = type_str[5:-1]
        return f"{python_type_to_ts(inner)}[]"

    # Handle Dict[K, V]
    if type_str.startswith("Dict["):
        inner = type_str[5:-1]
        parts = split_type_args(inner)
        if len(parts) == 2:
            key_type = python_type_to_ts(parts[0])
            val_type = python_type_to_ts(parts[1])
            return f"Record<{key_type}, {val_type}>"
        return "Record<string, unknown>"

    # Handle Literal types
    if type_str.startswith("Literal["):
        inner = type_str[8:-1]
        return inner  # Keep literal values as-is

    # Direct mapping
    if type_str in PYTHON_TO_TS:
        return PYTHON_TO_TS[type_str]

    # Assume it's a custom type (interface reference)
    return type_str


def split_type_args(args_str: str) -> List[str]:
    """Split type arguments respecting nested brackets."""
    result = []
    current = ""
    depth = 0

    for char in args_str:
        if char == "[":
            depth += 1
            current += char
        elif char == "]":
            depth -= 1
            current += char
        elif char == "," and depth == 0:
            result.append(current.strip())
            current = ""
        else:
            current += char

    if current.strip():
        result.append(current.strip())

    return result


class PydanticModelExtractor(ast.NodeVisitor):
    """Extract Pydantic model definitions from Python AST."""

    def __init__(self):
        self.models: Dict[str, List[tuple]] = {}  # name -> [(field, type, default)]
        self.current_model: Optional[str] = None

    def visit_ClassDef(self, node: ast.ClassDef):
        # Check if this class inherits from BaseModel
        is_pydantic = any(
            (isinstance(base, ast.Name) and base.id == "BaseModel") or
            (isinstance(base, ast.Attribute) and base.attr == "BaseModel")
            for base in node.bases
        )

        if is_pydantic:
            self.current_model = node.name
            self.models[node.name] = []

            for item in node.body:
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    field_name = item.target.id
                    type_str = self._get_type_str(item.annotation)
                    default = self._get_default(item.value) if item.value else None
                    self.models[node.name].append((field_name, type_str, default))

            self.current_model = None

        self.generic_visit(node)

    def _get_type_str(self, node) -> str:
        """Extract type string from AST annotation node."""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Constant):
            return str(node.value)
        elif isinstance(node, ast.Subscript):
            base = self._get_type_str(node.value)
            if isinstance(node.slice, ast.Tuple):
                args = ", ".join(self._get_type_str(el) for el in node.slice.elts)
            else:
                args = self._get_type_str(node.slice)
            return f"{base}[{args}]"
        elif isinstance(node, ast.Attribute):
            return f"{self._get_type_str(node.value)}.{node.attr}"
        elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
            left = self._get_type_str(node.left)
            right = self._get_type_str(node.right)
            return f"{left} | {right}"
        return "unknown"

    def _get_default(self, node) -> Optional[str]:
        """Get default value as string."""
        if isinstance(node, ast.Constant):
            if isinstance(node.value, str):
                return f'"{node.value}"'
            return str(node.value)
        elif isinstance(node, ast.List):
            return "[]"
        elif isinstance(node, ast.Dict):
            return "{}"
        return None


def extract_models_from_file(filepath: Path) -> Dict[str, List[tuple]]:
    """Extract Pydantic models from a Python file."""
    try:
        with open(filepath, "r") as f:
            source = f.read()
        tree = ast.parse(source)
        extractor = PydanticModelExtractor()
        extractor.visit(tree)
        return extractor.models
    except Exception as e:
        print(f"// Warning: Could not parse {filepath}: {e}", file=sys.stderr)
        return {}


def generate_typescript(models: Dict[str, List[tuple]]) -> str:
    """Generate TypeScript interfaces from extracted models."""
    lines = [
        "// =============================================================================",
        "// AUTO-GENERATED TypeScript Types from Python Pydantic Models",
        "// Generated by scripts/generate_types.py",
        "// DO NOT EDIT MANUALLY - regenerate with: python scripts/generate_types.py",
        "// =============================================================================",
        "",
    ]

    for model_name, fields in sorted(models.items()):
        lines.append(f"export interface {model_name} {{")
        for field_name, type_str, default in fields:
            ts_type = python_type_to_ts(type_str)
            optional = "?" if default is not None else ""
            lines.append(f"  {field_name}{optional}: {ts_type};")
        lines.append("}")
        lines.append("")

    return "\n".join(lines)


def main():
    """Main entry point."""
    # Find the project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    app_dir = project_root / "app"

    if not app_dir.exists():
        print(f"Error: app directory not found at {app_dir}", file=sys.stderr)
        sys.exit(1)

    all_models: Dict[str, List[tuple]] = {}

    # Scan all Python files in app directory
    for py_file in app_dir.rglob("*.py"):
        models = extract_models_from_file(py_file)
        all_models.update(models)

    # Generate TypeScript
    typescript = generate_typescript(all_models)
    print(typescript)

    # Print summary to stderr
    print(f"\n// Generated {len(all_models)} interfaces", file=sys.stderr)


if __name__ == "__main__":
    main()
