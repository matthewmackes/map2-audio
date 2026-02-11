# MAP2 Branding Assets

Professional branding components for MAP2 Audio Platform.

## Files

- **`map2-boot-splash.script`** - Plymouth boot splash theme (VSCode Dark)
- **`map2-boot-splash.plymouth`** - Plymouth theme configuration
- **`welcome.sh`** - Terminal welcome message with service status

## Quick Install

From the root directory:

```bash
./install_branding.sh
```

## What Gets Installed

### Boot Splash
- Shows during system boot
- Displays audio components loading
- Professional VSCode Dark theme
- Installed to: `/usr/share/plymouth/themes/map2/`

### Welcome Message
- Shows on every terminal login
- Lists all service ports and status
- System information and quick commands
- Installed to: `/etc/profile.d/map2-welcome.sh`

## Manual Installation

```bash
# Boot splash
sudo mkdir -p /usr/share/plymouth/themes/map2
sudo cp map2-boot-splash.* /usr/share/plymouth/themes/map2/
sudo plymouth-set-default-theme map2-boot-splash
sudo dracut -f

# Welcome message
sudo cp welcome.sh /etc/profile.d/map2-welcome.sh
echo 'source /etc/profile.d/map2-welcome.sh' >> ~/.bashrc
```

## Service Ports Reference

The welcome message displays these service endpoints:

- **Backend API**: `http://localhost:8080`
- **API Docs**: `http://localhost:8080/docs`
- **Web Dashboard (PROD)**: `http://localhost:3000` ← **PRODUCTION** static build (no hot-reload)
- **Web Dashboard (DEV)**: `http://localhost:3001` ← **DEVELOPMENT** server (hot-reload, use for coding!)
- **Prometheus**: `http://localhost:9090`
- **LCD Display**: I2C 0x27, 0x3F

**⚠️ IMPORTANT:** Port 3000 serves static files, port 3001 is the live dev server. See `/web/PORTS.md` for details.

## Customization

Edit the files in this directory, then run:

```bash
cd ..
./install_branding.sh
```

Changes will be applied system-wide.

## Color Palette (VSCode Dark)

- Background: `#1E1E1E`
- Primary Blue: `#007ACC`
- Success Green: `#4EC9B0`
- Accent Yellow: `#DCDCAA`
- Text Gray: `#D4D4D4`

## Documentation

See [../BRANDING.md](../BRANDING.md) for complete documentation.
