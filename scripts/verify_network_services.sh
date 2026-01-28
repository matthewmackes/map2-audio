#!/bin/bash
# MAP2 Network Service Verification Script
# Tests all MAP2 services for local subnet accessibility

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=============================================="
echo "MAP2 Audio Platform - Network Service Check"
echo "=============================================="
echo

# Get local IP and subnet
LOCAL_IP=$(ip route get 1 | awk '{print $7; exit}' | head -1)
SUBNET=$(ip route | grep "$LOCAL_IP" | grep "/" | awk '{print $1}' | head -1)

echo -e "${BLUE}Network Information:${NC}"
echo "  Local IP: $LOCAL_IP"
echo "  Subnet: $SUBNET"
echo

echo -e "${BLUE}=== MAP2 Service Status ===${NC}"
echo

# Check MAP2 Backend (Port 8080)
echo -e "${YELLOW}[1/5] MAP2 Backend API (Port 8080):${NC}"
if systemctl is-active map2-backend.service >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Service active${NC}"
    
    # Test localhost
    if curl -s http://localhost:8080/health >/dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Responding on localhost:8080${NC}"
    else
        echo -e "${RED}  ✗ Not responding on localhost${NC}"
    fi
    
    # Test network IP
    if curl -s http://$LOCAL_IP:8080/health >/dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Accessible from network ($LOCAL_IP:8080)${NC}"
    else
        echo -e "${RED}  ✗ Not accessible from network${NC}"
    fi
    
    # Show API endpoints
    echo -e "${BLUE}  → API Documentation: http://$LOCAL_IP:8080/docs${NC}"
    echo -e "${BLUE}  → Health Check: http://$LOCAL_IP:8080/health${NC}"
else
    echo -e "${RED}  ✗ Service not active${NC}"
fi
echo

# Check Prometheus (Port 9090)
echo -e "${YELLOW}[2/5] Prometheus Monitoring (Port 9090):${NC}"
if ss -tln | grep :9090 >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Listening on port 9090${NC}"
    
    if curl -s http://localhost:9090 >/dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Prometheus web interface accessible${NC}"
        echo -e "${BLUE}  → Prometheus: http://$LOCAL_IP:9090${NC}"
        echo -e "${BLUE}  → Metrics: http://$LOCAL_IP:9090/metrics${NC}"
    else
        echo -e "${RED}  ✗ Prometheus not responding${NC}"
    fi
else
    echo -e "${RED}  ✗ Prometheus not listening${NC}"
fi
echo

# Check SMB Shares (Ports 139, 445)
echo -e "${YELLOW}[3/5] SMB File Shares (Ports 139, 445):${NC}"
if ss -tln | grep :445 >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ SMB listening on port 445${NC}"
    echo -e "${BLUE}  → Access shares: \\\\$LOCAL_IP\\audio${NC}"
    echo -e "${BLUE}  → Browse: smb://$LOCAL_IP${NC}"
else
    echo -e "${RED}  ✗ SMB not listening on port 445${NC}"
fi

if ss -tln | grep :139 >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ NetBIOS listening on port 139${NC}"
else
    echo -e "${RED}  ✗ NetBIOS not listening on port 139${NC}"
fi
echo

# Check Firewall Status
echo -e "${YELLOW}[4/5] Firewall Status:${NC}"
if command -v firewall-cmd >/dev/null 2>&1; then
    if systemctl is-active firewalld >/dev/null 2>&1; then
        echo -e "${YELLOW}  ⚠ Firewalld active${NC}"
        
        # Check if ports are open
        OPEN_PORTS=""
        for PORT in 8080 9090 445 139; do
            if firewall-cmd --query-port=$PORT/tcp --quiet 2>/dev/null; then
                OPEN_PORTS="$OPEN_PORTS $PORT"
                echo -e "${GREEN}  ✓ Port $PORT/tcp is open${NC}"
            else
                echo -e "${RED}  ✗ Port $PORT/tcp is blocked${NC}"
            fi
        done
        
        if [ -z "$OPEN_PORTS" ]; then
            echo -e "${RED}  ⚠ No MAP2 ports are open in firewall${NC}"
            echo -e "${BLUE}  → To open ports: sudo firewall-cmd --permanent --add-port=8080/tcp${NC}"
            echo -e "${BLUE}  → Then reload: sudo firewall-cmd --reload${NC}"
        fi
    else
        echo -e "${GREEN}  ✓ Firewalld inactive (all ports open)${NC}"
    fi
else
    echo -e "${GREEN}  ✓ No firewall detected${NC}"
fi
echo

echo -e "${BLUE}=== Network Test Commands ===${NC}"
echo
echo -e "${YELLOW}From another computer on the subnet, test with:${NC}"
echo -e "${BLUE}  curl http://$LOCAL_IP:8080/health${NC}"
echo -e "${BLUE}  curl http://$LOCAL_IP:9090${NC}"
echo -e "${BLUE}  smbclient -L //$LOCAL_IP${NC}"
echo

echo -e "${BLUE}=== Service URLs ===${NC}"
echo
echo -e "${GREEN}MAP2 Services accessible at:${NC}"
echo -e "${BLUE}  • Backend API: http://$LOCAL_IP:8080${NC}"
echo -e "${BLUE}  • API Docs: http://$LOCAL_IP:8080/docs${NC}"
echo -e "${BLUE}  • Prometheus: http://$LOCAL_IP:9090${NC}"
echo -e "${BLUE}  • SMB Shares: \\\\$LOCAL_IP\\audio${NC}"
echo

echo -e "${BLUE}=== Local Terminal Interfaces ===${NC}"
echo
echo -e "${GREEN}TUI (Textual Terminal UI):${NC}"
echo -e "${BLUE}  textual run tui/app.py${NC}"
echo -e "${BLUE}  → Full-featured terminal interface${NC}"
echo -e "${BLUE}  → Real-time audio controls and monitoring${NC}"
echo -e "${BLUE}  → Works locally on this machine${NC}"
echo

# Summary
SERVICES_OK=0
SERVICES_TOTAL=4

if systemctl is-active map2-backend.service >/dev/null 2>&1 && ss -tln | grep :8080 >/dev/null 2>&1; then
    ((SERVICES_OK++))
fi

if ss -tln | grep :9090 >/dev/null 2>&1; then
    ((SERVICES_OK++))
fi

if ss -tln | grep :445 >/dev/null 2>&1; then
    ((SERVICES_OK++))
fi

echo -e "${BLUE}=== Summary ===${NC}"
if [ $SERVICES_OK -eq $SERVICES_TOTAL ]; then
    echo -e "${GREEN}✓ All MAP2 services are accessible from the local subnet ($SERVICES_OK/$SERVICES_TOTAL)${NC}"
else
    echo -e "${YELLOW}⚠ $SERVICES_OK/$SERVICES_TOTAL MAP2 services are accessible from the local subnet${NC}"
fi
echo