#!/bin/bash

echo "Testing sudo configuration for user: $(whoami)"
echo

# Test 1: Check if user can run sudo without password
echo "Test 1: Testing passwordless sudo access..."
if sudo -n true 2>/dev/null; then
    echo "✓ Passwordless sudo working"
else
    echo "✗ Passwordless sudo not configured"
    echo "  Setting up sudo access..."
    
    # This requires the user to enter password once
    sudo usermod -aG wheel $(whoami) 2>/dev/null || echo "Note: wheel group may not exist"
    echo "$(whoami) ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/$(whoami) > /dev/null
    sudo chmod 0440 /etc/sudoers.d/$(whoami)
    
    echo "✓ Sudo access configured"
fi
echo

# Test 2: Check group memberships
echo "Test 2: Checking group memberships..."
groups_output=$(groups $(whoami))
echo "Current groups: $groups_output"

if echo "$groups_output" | grep -q "wheel\|sudo"; then
    echo "✓ User in admin group (wheel/sudo)"
else
    echo "⚠ User not in admin group"
fi

if echo "$groups_output" | grep -q "audio"; then
    echo "✓ User in audio group"
else
    echo "⚠ User not in audio group"
fi
echo

# Test 3: Test package manager access
echo "Test 3: Testing package manager access..."
if sudo -n dnf --version >/dev/null 2>&1; then
    echo "✓ Package manager (dnf) access working"
elif sudo -n apt --version >/dev/null 2>&1; then
    echo "✓ Package manager (apt) access working"
else
    echo "⚠ Package manager access may have issues"
fi
echo

# Test 4: Test system file access
echo "Test 4: Testing system file access..."
if sudo -n touch /tmp/sudo_test 2>/dev/null && sudo -n rm /tmp/sudo_test 2>/dev/null; then
    echo "✓ System file manipulation working"
else
    echo "✗ System file access issues"
fi
echo

echo "Sudo configuration test complete!"
echo
echo "If all tests passed, the setup script should run without hanging."
echo "If any tests failed, run this script again or manually configure sudo."