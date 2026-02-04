#!/bin/bash
#
# MAP2 Audio Platform - Enhanced Boot Manager with Logo Integration
# Sets up custom boot splash with platform logo and system integration
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAP2_DIR="$SCRIPT_DIR"
PLYMOUTH_THEME_DIR="/usr/share/plymouth/themes/map2"
LOGO_SOURCE="$MAP2_DIR/MACKESAUDIOPLATFORM.png"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}    MAP2 Audio Platform - Boot Manager & Logo Setup    ${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root for boot splash installation"
        echo ""
        echo "Usage: sudo $0 [install|uninstall|status]"
        exit 1
    fi
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check for Plymouth
    if ! command -v plymouth &> /dev/null; then
        log_error "Plymouth not found. Install with: dnf install plymouth plymouth-theme-*"
        exit 1
    fi
    
    # Check for logo file
    if [ ! -f "$LOGO_SOURCE" ]; then
        log_error "Platform logo not found: $LOGO_SOURCE"
        exit 1
    fi
    
    log_success "All dependencies found"
}

install_boot_splash() {
    log_info "Installing MAP2 boot splash with platform logo..."
    
    # Check if logo exists
    if [ ! -f "$LOGO_SOURCE" ]; then
        log_error "Platform logo not found: $LOGO_SOURCE"
        return 1
    fi
    
    # Create Plymouth theme directory
    mkdir -p "$PLYMOUTH_THEME_DIR"
    log_success "Plymouth theme directory created: $PLYMOUTH_THEME_DIR"
    
    # Copy logo to Plymouth theme directory
    cp "$LOGO_SOURCE" "$PLYMOUTH_THEME_DIR/"
    if [ -f "$PLYMOUTH_THEME_DIR/MACKESAUDIOPLATFORM.png" ]; then
        log_success "Platform logo installed: $PLYMOUTH_THEME_DIR/MACKESAUDIOPLATFORM.png"
    else
        log_error "Failed to copy platform logo"
        return 1
    fi
    
    # Check if branding files exist
    if [ ! -f "$MAP2_DIR/branding/map2-boot-splash.plymouth" ]; then
        log_error "Plymouth config file not found: $MAP2_DIR/branding/map2-boot-splash.plymouth"
        return 1
    fi
    
    if [ ! -f "$MAP2_DIR/branding/map2-boot-splash.script" ]; then
        log_error "Plymouth script file not found: $MAP2_DIR/branding/map2-boot-splash.script"
        return 1
    fi
    
    # Copy Plymouth configuration files
    cp "$MAP2_DIR/branding/map2-boot-splash.plymouth" "$PLYMOUTH_THEME_DIR/"
    cp "$MAP2_DIR/branding/map2-boot-splash.script" "$PLYMOUTH_THEME_DIR/"
    
    # Set permissions
    chmod 644 "$PLYMOUTH_THEME_DIR"/*
    chown root:root "$PLYMOUTH_THEME_DIR"/*
    
    log_success "Boot splash files installed"
    
    # Verify files
    log_info "Verifying installation..."
    for file in "MACKESAUDIOPLATFORM.png" "map2-boot-splash.plymouth" "map2-boot-splash.script"; do
        if [ -f "$PLYMOUTH_THEME_DIR/$file" ]; then
            log_success "  $file - OK"
        else
            log_error "  $file - MISSING"
            return 1
        fi
    done
    
    # Update Plymouth configuration
    log_info "Configuring Plymouth theme..."
    
    # Set as default theme
    if plymouth-set-default-theme map2-boot-splash; then
        log_success "Plymouth theme set to map2-boot-splash"
    else
        log_error "Failed to set Plymouth theme"
        return 1
    fi
    
    # Rebuild initramfs
    log_info "Rebuilding initramfs (this may take a few moments)..."
    if dracut --regenerate-all --force; then
        log_success "Initramfs rebuilt successfully"
    else
        log_error "Failed to rebuild initramfs"
        return 1
    fi
    
    log_success "Boot splash installation complete!"
    echo ""
    log_info "The new MAP2 boot splash with platform logo will appear on next boot"
}

uninstall_boot_splash() {
    log_info "Uninstalling MAP2 boot splash..."
    
    # Restore default theme
    plymouth-set-default-theme spinner
    
    # Remove theme directory
    if [ -d "$PLYMOUTH_THEME_DIR" ]; then
        rm -rf "$PLYMOUTH_THEME_DIR"
        log_success "Boot splash files removed"
    fi
    
    # Rebuild initramfs
    log_info "Rebuilding initramfs..."
    dracut --regenerate-all --force
    
    log_success "Boot splash uninstallation complete"
}

show_status() {
    log_info "MAP2 Boot Splash Status"
    echo ""
    
    # Check current theme
    current_theme=$(plymouth-set-default-theme 2>/dev/null || echo "unknown")
    if [ "$current_theme" = "map2-boot-splash" ]; then
        log_success "MAP2 boot splash is ACTIVE"
    else
        log_warning "MAP2 boot splash is INACTIVE (current: $current_theme)"
    fi
    
    # Check files
    if [ -d "$PLYMOUTH_THEME_DIR" ]; then
        log_success "Theme files installed in: $PLYMOUTH_THEME_DIR"
        
        # Check individual files
        echo ""
        log_info "File status:"
        
        if [ -f "$PLYMOUTH_THEME_DIR/MACKESAUDIOPLATFORM.png" ]; then
            log_success "  Platform logo: PRESENT"
            # Get file size if possible
            if command -v ls &> /dev/null; then
                local size=$(ls -lh "$PLYMOUTH_THEME_DIR/MACKESAUDIOPLATFORM.png" | awk '{print $5}')
                echo -e "    Size: $size"
            fi
        else
            log_error "  Platform logo: MISSING"
        fi
        
        if [ -f "$PLYMOUTH_THEME_DIR/map2-boot-splash.plymouth" ]; then
            log_success "  Plymouth config: PRESENT"
        else
            log_error "  Plymouth config: MISSING"
        fi
        
        if [ -f "$PLYMOUTH_THEME_DIR/map2-boot-splash.script" ]; then
            log_success "  Plymouth script: PRESENT"
        else
            log_error "  Plymouth script: MISSING"
        fi
        
        # List all files
        echo ""
        log_info "All files in theme directory:"
        ls -la "$PLYMOUTH_THEME_DIR/" | while read line; do
            echo "    $line"
        done
    else
        log_error "Theme directory not found: $PLYMOUTH_THEME_DIR"
    fi
    
    # Check source logo
    echo ""
    log_info "Source files:"
    if [ -f "$LOGO_SOURCE" ]; then
        log_success "  Source logo: $LOGO_SOURCE"
    else
        log_error "  Source logo: MISSING ($LOGO_SOURCE)"
    fi
    
    echo ""
    log_info "To test boot splash: plymouth --show-splash"
    log_info "To manage splash visibility: $0 splash [show|hide|status]"
    
    # Show repair option if needed
    if [ -d "$PLYMOUTH_THEME_DIR" ] && [ ! -f "$PLYMOUTH_THEME_DIR/MACKESAUDIOPLATFORM.png" ] && [ -f "$LOGO_SOURCE" ]; then
        echo ""
        log_warning "Missing logo can be fixed with: $0 repair"
    fi
}

repair_logo() {
    log_info "Repairing missing platform logo..."
    
    # Check if source logo exists
    if [ ! -f "$LOGO_SOURCE" ]; then
        log_error "Source logo not found: $LOGO_SOURCE"
        return 1
    fi
    
    # Check if theme directory exists
    if [ ! -d "$PLYMOUTH_THEME_DIR" ]; then
        log_error "Plymouth theme directory not found: $PLYMOUTH_THEME_DIR"
        log_info "Run '$0 install' for full installation"
        return 1
    fi
    
    # Copy logo
    cp "$LOGO_SOURCE" "$PLYMOUTH_THEME_DIR/"
    
    # Verify copy
    if [ -f "$PLYMOUTH_THEME_DIR/MACKESAUDIOPLATFORM.png" ]; then
        log_success "Platform logo copied successfully"
        
        # Set correct permissions
        chmod 644 "$PLYMOUTH_THEME_DIR/MACKESAUDIOPLATFORM.png"
        chown root:root "$PLYMOUTH_THEME_DIR/MACKESAUDIOPLATFORM.png"
        
        log_success "Logo repair complete!"
        
        # Set theme and rebuild initramfs
        log_info "Updating Plymouth configuration..."
        plymouth-set-default-theme map2-boot-splash
        
        log_info "Rebuilding initramfs..."
        dracut --regenerate-all --force
        
        log_success "System updated - logo will appear on next boot"
    else
        log_error "Failed to copy logo file"
        return 1
    fi
}

update_grub_logo() {
    log_info "Installing platform logo for GRUB boot menu..."
    
    # Copy logo to GRUB directory (if exists)
    if [ -d "/boot/grub2" ]; then
        cp "$LOGO_SOURCE" "/boot/grub2/MAP2-logo.png"
        log_success "GRUB logo installed: /boot/grub2/MAP2-logo.png"
        
        # Update GRUB configuration
        if [ -f "/etc/default/grub" ]; then
            # Add logo to GRUB config if not already present
            if ! grep -q "GRUB_BACKGROUND" /etc/default/grub; then
                echo "GRUB_BACKGROUND=/boot/grub2/MAP2-logo.png" >> /etc/default/grub
                log_success "GRUB background configuration added"
            else
                log_info "GRUB background already configured"
            fi
            
            # Regenerate GRUB config
            log_info "Regenerating GRUB configuration..."
            if command -v grub2-mkconfig &> /dev/null; then
                grub2-mkconfig -o /boot/grub2/grub.cfg
            else
                update-grub
            fi
            log_success "GRUB configuration updated"
        fi
    else
        log_warning "GRUB directory not found - skipping GRUB logo installation"
    fi
}

manage_boot_splash_visibility() {
    local action=${1:-status}
    
    case $action in
        show|enable)
            log_info "Configuring kernel to show boot splash..."
            
            if [ ! -f "/etc/default/grub" ]; then
                log_error "GRUB configuration not found: /etc/default/grub"
                return 1
            fi
            
            # Create backup
            cp /etc/default/grub /etc/default/grub.map2-backup
            log_info "Created backup: /etc/default/grub.map2-backup"
            
            # Remove rhgb and quiet from GRUB_CMDLINE_LINUX
            log_info "Removing 'rhgb quiet' from kernel parameters..."
            
            sed -i.bak \
                -e 's/\brhgb\b//g' \
                -e 's/\bquiet\b//g' \
                -e 's/  */ /g' \
                -e 's/GRUB_CMDLINE_LINUX=" /GRUB_CMDLINE_LINUX="/' \
                -e 's/ "/"/g' \
                /etc/default/grub
            
            # Verify changes
            if grep -q "rhgb\|quiet" /etc/default/grub; then
                log_warning "Some kernel parameters may still be present"
            else
                log_success "Kernel parameters updated successfully"
            fi
            
            # Regenerate GRUB configuration
            log_info "Regenerating GRUB configuration..."
            if command -v grub2-mkconfig &> /dev/null; then
                grub2-mkconfig -o /boot/grub2/grub.cfg
            else
                update-grub
            fi
            
            log_success "Boot splash will be visible on next boot!"
            log_info "Boot process will show detailed loading information"
            ;;
            
        hide|disable)
            log_info "Configuring kernel to hide boot splash (standard mode)..."
            
            if [ ! -f "/etc/default/grub" ]; then
                log_error "GRUB configuration not found: /etc/default/grub"
                return 1
            fi
            
            # Check if rhgb quiet are already present
            if grep -q "rhgb.*quiet\|quiet.*rhgb" /etc/default/grub; then
                log_info "Kernel parameters already configured for hidden splash"
                return 0
            fi
            
            # Add rhgb quiet to GRUB_CMDLINE_LINUX if not present
            log_info "Adding 'rhgb quiet' to kernel parameters..."
            
            # Find GRUB_CMDLINE_LINUX line and add parameters
            if grep -q '^GRUB_CMDLINE_LINUX=' /etc/default/grub; then
                sed -i 's/^GRUB_CMDLINE_LINUX="\(.*\)"/GRUB_CMDLINE_LINUX="\1 rhgb quiet"/' /etc/default/grub
                log_success "Kernel parameters updated"
            else
                echo 'GRUB_CMDLINE_LINUX="rhgb quiet"' >> /etc/default/grub
                log_success "Kernel parameters added"
            fi
            
            # Regenerate GRUB configuration
            log_info "Regenerating GRUB configuration..."
            if command -v grub2-mkconfig &> /dev/null; then
                grub2-mkconfig -o /boot/grub2/grub.cfg
            else
                update-grub
            fi
            
            log_success "Boot splash will be hidden on next boot (standard mode)"
            ;;
            
        status|*)
            log_info "Current boot splash visibility settings:"
            echo ""
            
            if [ -f "/etc/default/grub" ]; then
                local grub_line=$(grep "^GRUB_CMDLINE_LINUX=" /etc/default/grub)
                
                if echo "$grub_line" | grep -q "rhgb.*quiet\|quiet.*rhgb"; then
                    log_warning "Boot splash is HIDDEN (rhgb quiet enabled)"
                    echo -e "  Current: $grub_line"
                    echo ""
                    log_info "To show boot splash: $0 splash show"
                elif echo "$grub_line" | grep -q "rhgb\|quiet"; then
                    log_warning "Partial hiding (only rhgb OR quiet present)"
                    echo -e "  Current: $grub_line"
                else
                    log_success "Boot splash is VISIBLE (rhgb quiet disabled)"
                    echo -e "  Current: $grub_line"
                    echo ""
                    log_info "To hide boot splash: $0 splash hide"
                fi
            else
                log_error "GRUB configuration not found: /etc/default/grub"
            fi
            ;;
    esac
}

print_banner

case "${1:-status}" in
    install)
        check_root
        check_dependencies
        install_boot_splash
        update_grub_logo
        echo ""
        log_success "Complete! Platform logo installed for:"
        log_success "  • Plymouth boot splash"
        log_success "  • GRUB boot menu"
        echo ""
        log_info "Changes will take effect after reboot"
        log_info "To make splash visible during boot: $0 splash show"
        ;;
        
    uninstall)
        check_root
        uninstall_boot_splash
        ;;
        
    repair)
        check_root
        repair_logo
        ;;
        
    splash)
        check_root
        manage_boot_splash_visibility "${2:-status}"
        ;;
        
    status)
        show_status
        echo ""
        # Also show splash visibility status
        manage_boot_splash_visibility status
        ;;
        
    test)
        if [ "$EUID" -ne 0 ]; then
            log_error "Test mode requires root privileges"
            exit 1
        fi
        log_info "Testing Plymouth splash (press Ctrl+C to stop)..."
        plymouth --show-splash &
        sleep 5
        plymouth --quit
        ;;
        
    *)
        echo "MAP2 Audio Platform - Boot Manager"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  install         Install MAP2 boot splash with platform logo (requires root)"
        echo "  uninstall       Remove MAP2 boot splash (requires root)"
        echo "  repair          Fix missing logo in existing installation (requires root)"
        echo "  test            Test boot splash display (requires root)"
        echo "  status          Show current installation status"
        echo "  splash [action] Manage boot splash visibility during boot:"
        echo "    show          Make boot splash visible (remove rhgb quiet)"
        echo "    hide          Hide boot splash (add rhgb quiet)"  
        echo "    status        Show current visibility settings"
        echo ""
        echo "The platform logo (MACKESAUDIOPLATFORM.png) will be used for:"
        echo "  • Plymouth boot splash screen"
        echo "  • GRUB boot menu background"
        echo ""
        echo "Examples:"
        echo "  $0 install           # Install boot splash with logo"
        echo "  $0 splash show       # Make splash visible during boot"
        echo "  $0 splash hide       # Hide splash for clean boot"
        echo "  $0 status            # Show complete status"
        echo ""
        ;;
esac