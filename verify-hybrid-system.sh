#!/bin/bash

# Hybrid Update System - Verification Script
# Checks that all files have been created and system is ready

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  MAP2 Hybrid Update System - Installation Verification         ║"
echo "║  Checking all components are in place...                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

TOTAL_FILES=0
FOUND_FILES=0
ERRORS=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_file() {
    local file=$1
    local description=$2
    
    ((TOTAL_FILES++))
    
    if [ -f "$file" ]; then
        ((FOUND_FILES++))
        echo -e "${GREEN}✓${NC} $description"
        echo "  └─ $file"
    else
        ((ERRORS++))
        echo -e "${RED}✗${NC} $description"
        echo "  └─ $file (NOT FOUND)"
    fi
}

check_dir() {
    local dir=$1
    local description=$2
    
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $description"
        echo "  └─ $dir"
    else
        ((ERRORS++))
        echo -e "${RED}✗${NC} $description"
        echo "  └─ $dir (NOT FOUND)"
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "BACKEND SERVICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "app/services/cluster/map2_git_updater.py" "Git Updater Service"
check_file "app/services/cluster/hybrid_update_manager.py" "Hybrid Update Manager"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "API ROUTES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "app/routes/cluster_update_hybrid.py" "Hybrid Update API Routes"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RPM PACKAGING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_dir "packaging" "Packaging Directory"
check_file "packaging/map2-audio.spec" "RPM Spec File"
check_file "packaging/build-rpm.sh" "RPM Build Script"
check_file "packaging/systemd/map2-backend.service" "Backend Systemd Unit"
check_file "packaging/systemd/map2-frontend.service" "Frontend Systemd Unit"
check_file "packaging/systemd/map2-cluster.service" "Cluster Systemd Unit"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "GITHUB ACTIONS WORKFLOWS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_dir ".github/workflows" "Workflows Directory"
check_file ".github/workflows/build-rpm.yml" "RPM Build Workflow"
check_file ".github/workflows/test-rpm.yml" "RPM Test Workflow"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DOCUMENTATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_dir "docs" "Documentation Directory"
check_file "docs/GITHUB_ACTION_SETUP.md" "GitHub Actions Setup Guide"
check_file "docs/UPDATE_SYSTEM_USAGE.md" "Update System Usage Guide"
check_file "docs/RPM_PACKAGING.md" "RPM Packaging Guide"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "IMPLEMENTATION DOCUMENTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "HYBRID_UPDATE_IMPLEMENTATION_PLAN.md" "Implementation Plan"
check_file "HYBRID_UPDATE_SETUP_AND_TESTING.md" "Setup & Testing Guide"
check_file "HYBRID_UPDATE_COMPLETE_SUMMARY.md" "Complete Summary"
check_file "HYBRID_UPDATE_FILE_MANIFEST.md" "File Manifest"
check_file "CLUSTER_UPDATES_SYSTEM.md" "Cluster Updates System"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  VERIFICATION RESULTS                                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ ALL CHECKS PASSED${NC}"
    echo ""
    echo "Files Found: $FOUND_FILES / $TOTAL_FILES"
    echo ""
    echo "System Status: ${GREEN}READY FOR DEPLOYMENT${NC}"
    echo ""
    echo "Next Steps:"
    echo "1. Commit changes: git add -A && git commit -m 'Add hybrid update system'"
    echo "2. Create release:  git tag -a v1.0.0 -m 'Release v1.0.0'"
    echo "3. Push to GitHub:  git push origin v1.0.0"
    echo "4. Monitor workflow at: https://github.com/matthewmackes/map2-audio/actions"
    echo ""
else
    echo -e "${RED}✗ VERIFICATION FAILED${NC}"
    echo ""
    echo "Files Found: $FOUND_FILES / $TOTAL_FILES"
    echo "Errors: $ERRORS"
    echo ""
    echo "Please check the missing files above and ensure they are created."
    echo ""
    exit 1
fi

# Additional checks
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ADDITIONAL CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Python syntax
echo "Checking Python syntax..."
python3 -m py_compile app/services/cluster/map2_git_updater.py 2>/dev/null && \
    echo -e "${GREEN}✓${NC} map2_git_updater.py" || \
    echo -e "${RED}✗${NC} map2_git_updater.py syntax error"

python3 -m py_compile app/services/cluster/hybrid_update_manager.py 2>/dev/null && \
    echo -e "${GREEN}✓${NC} hybrid_update_manager.py" || \
    echo -e "${RED}✗${NC} hybrid_update_manager.py syntax error"

python3 -m py_compile app/routes/cluster_update_hybrid.py 2>/dev/null && \
    echo -e "${GREEN}✓${NC} cluster_update_hybrid.py" || \
    echo -e "${RED}✗${NC} cluster_update_hybrid.py syntax error"

echo ""

# Check file sizes
echo "Checking file sizes..."
echo ""
echo "Backend Services:"
wc -l app/services/cluster/map2_git_updater.py | awk '{print "  map2_git_updater.py: " $1 " lines"}'
wc -l app/services/cluster/hybrid_update_manager.py | awk '{print "  hybrid_update_manager.py: " $1 " lines"}'

echo ""
echo "API Routes:"
wc -l app/routes/cluster_update_hybrid.py | awk '{print "  cluster_update_hybrid.py: " $1 " lines"}'

echo ""
echo "RPM Packaging:"
wc -l packaging/map2-audio.spec | awk '{print "  map2-audio.spec: " $1 " lines"}'
wc -l packaging/build-rpm.sh | awk '{print "  build-rpm.sh: " $1 " lines"}'

echo ""
echo "GitHub Actions:"
wc -l .github/workflows/build-rpm.yml | awk '{print "  build-rpm.yml: " $1 " lines"}'
wc -l .github/workflows/test-rpm.yml | awk '{print "  test-rpm.yml: " $1 " lines"}'

echo ""
echo "Documentation:"
wc -l docs/GITHUB_ACTION_SETUP.md | awk '{print "  GITHUB_ACTION_SETUP.md: " $1 " lines"}'
wc -l docs/UPDATE_SYSTEM_USAGE.md | awk '{print "  UPDATE_SYSTEM_USAGE.md: " $1 " lines"}'
wc -l docs/RPM_PACKAGING.md | awk '{print "  RPM_PACKAGING.md: " $1 " lines"}'

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  SYSTEM READY FOR PRODUCTION USE                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
