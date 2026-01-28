#!/bin/bash
# MAP2 Audio Platform - Public Network Accessibility Verification
# Tests all interfaces are accessible from the local network

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "═══════════════════════════════════════════════════════════════"
echo "  MAP2 Audio Platform - Public Network Accessibility Test"
echo "═══════════════════════════════════════════════════════════════"
echo

# Get local IP
LOCAL_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' | head -1)
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

echo -e "${BLUE}Testing from IP:${NC} $LOCAL_IP"
echo

# Test function
test_port() {
    local port=$1
    local service=$2
    local host=${3:-"0.0.0.0"}
    
    echo -n "Testing $service (port $port)... "
    
    # Check if listening
    if ss -tln 2>/dev/null | grep -q ":$port "; then
        # Check binding
        local bind_addr=$(ss -tln 2>/dev/null | grep ":$port " | head -1 | awk '{print $4}')
        
        if echo "$bind_addr" | grep -q "^0.0.0.0:" || echo "$bind_addr" | grep -q "^\*:"; then
            echo -e "${GREEN}✓ OPEN (listening on all interfaces)${NC}"
            
            # Test actual connectivity
            if command -v curl &>/dev/null && [ $port -eq 8080 ] || [ $port -eq 3000 ] || [ $port -eq 9090 ]; then
                if timeout 2 curl -s http://localhost:$port >/dev/null 2>&1; then
                    echo -e "  ${GREEN}✓ HTTP response OK${NC}"
                else
                    echo -e "  ${YELLOW}⚠ Service not responding to HTTP${NC}"
                fi
            fi
            return 0
        elif echo "$bind_addr" | grep -q "^127.0.0.1:"; then
            echo -e "${RED}✗ PRIVATE (localhost only - NOT ACCESSIBLE FROM NETWORK)${NC}"
            echo -e "  ${YELLOW}⚠ Service is bound to 127.0.0.1 - needs 0.0.0.0${NC}"
            return 1
        else
            echo -e "${YELLOW}? UNKNOWN binding: $bind_addr${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}✗ NOT LISTENING${NC}"
        return 1
    fi
}

echo -e "${BLUE}═══ MAP2 Services ═══${NC}"
echo

# Test Backend API
test_port 8080 "Backend API (FastAPI)" 
BACKEND_OK=$?

# Test Web Dashboard
test_port 3000 "Web Dashboard (React/Vite)"
WEB_OK=$?

# Test Prometheus
test_port 9090 "Prometheus Monitoring"
PROM_OK=$?

echo
echo -e "${BLUE}═══ File Sharing Services ═══${NC}"
echo

# Test SMB
test_port 445 "SMB File Sharing"
SMB_OK=$?

test_port 139 "NetBIOS/SMB"
NETBIOS_OK=$?

echo
echo -e "${BLUE}═══ Network Configuration Check ═══${NC}"
echo

# Check service files
echo "Checking service configurations..."
if [ -f "/etc/systemd/system/map2-backend.service" ]; then
    if grep -q -- "--host 0.0.0.0" /etc/systemd/system/map2-backend.service; then
        echo -e "${GREEN}✓ Backend service configured for 0.0.0.0${NC}"
    else
        echo -e "${RED}✗ Backend service may not be configured for network access${NC}"
    fi
fi

# Check Vite config
if [ -f "web/vite.config.ts" ]; then
    if grep -q "host.*0.0.0.0" web/vite.config.ts; then
        echo -e "${GREEN}✓ Vite configured for 0.0.0.0${NC}"
    else
        echo -e "${YELLOW}⚠ Vite may need host: '0.0.0.0' in config${NC}"
    fi
fi

# Check firewall
echo
echo "Checking firewall status..."
if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null; then
    echo -e "${YELLOW}⚠ Firewalld is active${NC}"
    for port in 8080 3000 9090; do
        if firewall-cmd --query-port=$port/tcp --quiet 2>/dev/null; then
            echo -e "  ${GREEN}✓ Port $port/tcp is open${NC}"
        else
            echo -e "  ${RED}✗ Port $port/tcp is blocked${NC}"
            echo -e "    ${BLUE}To open: sudo firewall-cmd --permanent --add-port=$port/tcp${NC}"
        fi
    done
    echo -e "  ${BLUE}After changes: sudo firewall-cmd --reload${NC}"
else
    echo -e "${GREEN}✓ No active firewall detected${NC}"
fi

echo
echo -e "${BLUE}═══ Summary ═══${NC}"
echo

TOTAL=5
SUCCESS=0
[ $BACKEND_OK -eq 0 ] && ((SUCCESS++))
[ $WEB_OK -eq 0 ] && ((SUCCESS++))
[ $PROM_OK -eq 0 ] && ((SUCCESS++))
[ $SMB_OK -eq 0 ] && ((SUCCESS++))
[ $NETBIOS_OK -eq 0 ] && ((SUCCESS++))

echo "Accessible services: $SUCCESS/$TOTAL"
echo

if [ $SUCCESS -eq $TOTAL ]; then
    echo -e "${GREEN}✓ ALL SERVICES ARE ACCESSIBLE FROM THE NETWORK!${NC}"
    echo
    echo "Access URLs (from any device on your network):"
    echo -e "  ${BLUE}Backend API:${NC}     http://$LOCAL_IP:8080/docs"
    echo -e "  ${BLUE}Web Dashboard:${NC}   http://$LOCAL_IP:3000"
    echo -e "  ${BLUE}Prometheus:${NC}      http://$LOCAL_IP:9090"
    echo -e "  ${BLUE}SMB Shares:${NC}      \\\\$LOCAL_IP\\audio"
elif [ $SUCCESS -gt 0 ]; then
    echo -e "${YELLOW}⚠ PARTIAL ACCESS - Some services are not public${NC}"
    echo
    echo "Issues found:"
    [ $BACKEND_OK -ne 0 ] && echo -e "  ${RED}✗ Backend not accessible${NC}"
    [ $WEB_OK -ne 0 ] && echo -e "  ${RED}✗ Web dashboard not accessible${NC}"
    [ $PROM_OK -ne 0 ] && echo -e "  ${YELLOW}⚠ Prometheus not running${NC}"
    [ $SMB_OK -ne 0 ] && echo -e "  ${YELLOW}⚠ SMB not accessible${NC}"
    echo
    echo "Fix suggestions:"
    echo "1. Ensure services bind to 0.0.0.0 (not 127.0.0.1)"
    echo "2. Check firewall rules"
    echo "3. Restart services after config changes"
else
    echo -e "${RED}✗ NO SERVICES ARE PUBLICLY ACCESSIBLE${NC}"
    echo
    echo "Please check:"
    echo "1. Services are running: systemctl status map2-backend map2-web"
    echo "2. Services bind to 0.0.0.0 in their configs"
    echo "3. Firewall allows the ports"
fi

echo
exit $(($TOTAL - $SUCCESS))