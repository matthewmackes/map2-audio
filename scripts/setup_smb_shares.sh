#!/bin/bash
# Setup SMB/CIFS shares for MAP2 audio folders
# NOTE: This script is now integrated into setup.sh
#       Run ./setup.sh instead - SMB shares are configured automatically

echo "═══════════════════════════════════════════════════════════════════════════"
echo "⚠️  This script is deprecated"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "SMB network shares are now automatically configured during installation."
echo ""
echo "To setup MAP2 Audio with SMB shares included, run:"
echo "  ./setup.sh"
echo ""
echo "SMB shares are already configured if you ran setup.sh"
echo ""
echo "To reconfigure SMB manually, the configuration is now in setup.sh"
echo "═══════════════════════════════════════════════════════════════════════════"
exit 0

echo "═══════════════════════════════════════════════════════════════════════════"
echo "MAP2 Audio - SMB Network Share Setup"
echo "═══════════════════════════════════════════════════════════════════════════"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (sudo)"
    exit 1
fi

# Install Samba if not present
if ! command -v smbd &> /dev/null; then
    echo "Installing Samba..."
    if command -v dnf &> /dev/null; then
        dnf install -y samba samba-common
    elif command -v apt &> /dev/null; then
        apt install -y samba samba-common
    else
        echo "Error: Unsupported package manager"
        exit 1
    fi
fi

# Create shared directories
echo "Creating shared directories..."
mkdir -p /var/lib/map2/nams
mkdir -p /var/lib/map2/irs
mkdir -p /var/lib/map2/lv2
mkdir -p /var/lib/map2/shared

# Set permissions (read/write for everyone)
echo "Setting permissions..."
chmod -R 777 /var/lib/map2/nams
chmod -R 777 /var/lib/map2/irs
chmod -R 777 /var/lib/map2/lv2
chmod -R 777 /var/lib/map2/shared

# Set ownership
chown -R $SUDO_USER:$SUDO_USER /var/lib/map2 2>/dev/null || true

# Backup existing Samba config
if [ -f /etc/samba/smb.conf ]; then
    cp /etc/samba/smb.conf /etc/samba/smb.conf.backup.$(date +%Y%m%d_%H%M%S)
fi

# Create Samba configuration
echo "Configuring Samba..."
cat > /etc/samba/smb.conf << 'EOF'
[global]
   workgroup = WORKGROUP
   server string = MAP2 Audio Processor
   netbios name = MAP2
   security = user
   map to guest = Bad User
   dns proxy = no
   
   # Performance tuning
   socket options = TCP_NODELAY IPTOS_LOWDELAY SO_RCVBUF=131072 SO_SNDBUF=131072
   read raw = yes
   write raw = yes
   max xmit = 65535
   dead time = 15
   getwd cache = yes

# MAP2 NAM Models - Neural Amp Models
[MAP2-NAMs]
   comment = MAP2 Neural Amp Models
   path = /var/lib/map2/nams
   browseable = yes
   writable = yes
   guest ok = yes
   read only = no
   create mask = 0777
   directory mask = 0777
   force user = nobody
   force group = nogroup

# MAP2 Impulse Responses - Cabinet IRs & Reverbs
[MAP2-IRs]
   comment = MAP2 Impulse Responses
   path = /var/lib/map2/irs
   browseable = yes
   writable = yes
   guest ok = yes
   read only = no
   create mask = 0777
   directory mask = 0777
   force user = nobody
   force group = nogroup

# MAP2 LV2 Plugins
[MAP2-LV2]
   comment = MAP2 LV2 Plugins
   path = /var/lib/map2/lv2
   browseable = yes
   writable = yes
   guest ok = yes
   read only = no
   create mask = 0777
   directory mask = 0777
   force user = nobody
   force group = nogroup

# MAP2 Shared Files
[MAP2-Shared]
   comment = MAP2 Shared Files
   path = /var/lib/map2/shared
   browseable = yes
   writable = yes
   guest ok = yes
   read only = no
   create mask = 0777
   directory mask = 0777
   force user = nobody
   force group = nogroup
EOF

# Test Samba configuration
echo "Testing Samba configuration..."
testparm -s /etc/samba/smb.conf

# Enable and start Samba services
echo "Enabling Samba services..."
systemctl enable smb nmb
systemctl restart smb nmb

# Configure firewall if firewalld is running
if systemctl is-active --quiet firewalld; then
    echo "Configuring firewall..."
    firewall-cmd --permanent --add-service=samba
    firewall-cmd --reload
fi

# Get IP address
IP_ADDR=$(hostname -I | awk '{print $1}')

echo "═══════════════════════════════════════════════════════════════════════════"
echo "✅ SMB Network Shares Setup Complete!"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "Access from Windows:"
echo "  \\\\$IP_ADDR\\MAP2-NAMs      - Neural Amp Models"
echo "  \\\\$IP_ADDR\\MAP2-IRs       - Impulse Responses"
echo "  \\\\$IP_ADDR\\MAP2-LV2       - LV2 Plugins"
echo "  \\\\$IP_ADDR\\MAP2-Shared    - Shared Files"
echo ""
echo "Access from Linux/Mac:"
echo "  smb://$IP_ADDR/MAP2-NAMs"
echo "  smb://$IP_ADDR/MAP2-IRs"
echo "  smb://$IP_ADDR/MAP2-LV2"
echo "  smb://$IP_ADDR/MAP2-Shared"
echo ""
echo "All shares are read/write accessible without password (guest access)"
echo ""
echo "Folder Locations:"
echo "  NAMs:   /var/lib/map2/nams"
echo "  IRs:    /var/lib/map2/irs"
echo "  LV2:    /var/lib/map2/lv2"
echo "  Shared: /var/lib/map2/shared"
echo "═══════════════════════════════════════════════════════════════════════════"
