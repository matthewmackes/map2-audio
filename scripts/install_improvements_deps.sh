#!/bin/bash
# Quick Installation Script for New Dependencies

echo "Installing new dependencies for platform improvements..."

pip install jsonschema>=4.17.0
pip install psutil>=5.9.0
pip install pytest-cov>=4.1.0

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "You can now:"
echo "  - Run tests: pytest tests/test_improvements.py -v --cov=app"
echo "  - Run integration tests: python scripts/test_improvements_integration.py"
echo "  - Start server: python -m app.main"
echo ""
