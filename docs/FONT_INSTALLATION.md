# MPlus Nerd Font Installation

## Overview

MAP2 Audio Platform uses **MPlus Nerd Font** as the default system monospace font with a **Material Blue 800 on White** color scheme. This provides:

- ✅ Nerd Font icons and glyphs for enhanced terminal UI
- ✅ Clear, readable monospace characters for code and logs
- ✅ Professional Material Design color scheme
- ✅ Support for ligatures and programming symbols

## Terminal Color Scheme

The default terminal uses Material Design Blue 800:
- **Background**: White (#FFFFFF)
- **Foreground**: Material Blue 800 (#1565C0 / RGB: 21, 101, 192)
- **Prompt**: All elements in Material Blue 800

This color scheme is automatically applied via `.bashrc` configuration.

## Automatic Installation

The font is automatically installed by the `install_on_new_host.sh` script in **Phase 2.5**.

### What Gets Installed

- **Font**: MPlus Nerd Font v3.4.0 (99 font variants)
- **Location**: `/usr/share/fonts/truetype/mplus-nerd/`
- **Fontconfig**: `/etc/fonts/local.conf` (sets MPlus as default monospace)
- **Cache**: System font cache updated via `fc-cache`

## Manual Installation

If you need to install the font manually:

```bash
# Download font
cd /tmp
wget https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/MPlus.zip

# Extract and install
unzip MPlus.zip -d MPlus
sudo mkdir -p /usr/share/fonts/truetype/mplus-nerd
sudo cp MPlus/*.ttf /usr/share/fonts/truetype/mplus-nerd/

# Update font cache
sudo fc-cache -f -v

# Verify installation
fc-list | grep -i mplus
```

## Fontconfig Setup

The system-wide fontconfig at `/etc/fonts/local.conf` ensures MPlus is preferred:

```xml
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <!-- Set MPlus Nerd Font as preferred monospace font -->
  <alias>
    <family>monospace</family>
    <prefer>
      <family>M+CodeLat50 Nerd Font Mono</family>
      <family>M+1 Nerd Font Mono</family>
      <family>DejaVu Sans Mono</family>
    </prefer>
  </alias>
  
  <!-- Match terminal applications -->
  <match target="pattern">
    <test qual="any" name="family">
      <string>monospace</string>
    </test>
    <edit name="family" mode="prepend" binding="strong">
      <string>M+CodeLat50 Nerd Font Mono</string>
    </edit>
  </match>
</fontconfig>
```

## Verification

Check that the font is properly installed and configured:

```bash
# Verify font is installed
fc-list | grep -i mplus | wc -l
# Should return: 99

# Check default monospace font
fc-match monospace
# Should return: M+CodeLat50NerdFontMono-Regular.ttf

# Verify specific font exists
fc-match "M+CodeLat50 Nerd Font Mono"
# Should return: M+CodeLat50NerdFontMono-Regular.ttf
```

## Terminal Configuration

Most modern terminal emulators will automatically use the system's default monospace font. If your terminal doesn't automatically pick up the font, you can configure it manually:

### GNOME Terminal

```bash
dconf write /org/gnome/terminal/legacy/profiles:/:default/font "'M+CodeLat50 Nerd Font Mono 11'"
dconf write /org/gnome/terminal/legacy/profiles:/:default/use-system-font false
```

### Konsole (KDE)

Edit `~/.local/share/konsole/Profile.profile`:
```ini
[Appearance]
Font=M+CodeLat50 Nerd Font Mono,11,-1,5,50,0,0,0,0,0
```

### Alacritty

Edit `~/.config/alacritty/alacritty.yml`:
```yaml
font:
  normal:
    family: "M+CodeLat50 Nerd Font Mono"
  size: 11.0
```

### VS Code Integrated Terminal

Edit VS Code settings (`settings.json`):
```json
{
  "terminal.integrated.fontFamily": "M+CodeLat50 Nerd Font Mono"
}
```

## Font Variants

The MPlus Nerd Font includes multiple variants:

- **M+CodeLat50 Nerd Font Mono** - Recommended for terminals (fixed width)
- **M+CodeLat60 Nerd Font Mono** - Slightly wider variant
- **M+1 Nerd Font Mono** - Alternative style
- **M+2 Nerd Font Mono** - Another style option

Each variant includes weights: Thin, Light, Regular, Medium, Bold, Heavy, Black

## Troubleshooting

### Font Not Showing Up

1. Rebuild font cache:
   ```bash
   sudo fc-cache -f -v
   ```

2. Check font is in cache:
   ```bash
   fc-list | grep -i mplus
   ```

3. Restart your terminal application

### Terminal Still Uses Old Font

1. Close all terminal windows
2. Check fontconfig is loaded:
   ```bash
   fc-match monospace
   ```
3. If not MPlus, check `/etc/fonts/local.conf` exists
4. Manually set font in terminal preferences

### Font Looks Wrong

- Ensure you're using the **Mono** variant (`M+CodeLat50 Nerd Font Mono`)
- Non-Mono variants have variable width and won't align properly in terminals
- Check terminal font size (recommended: 10-12pt)

## Related Files

- **Install Script**: `install_on_new_host.sh` (Phase 2.5)
- **Font Directory**: `/usr/share/fonts/truetype/mplus-nerd/`
- **Fontconfig**: `/etc/fonts/local.conf`
- **Source**: https://github.com/ryanoasis/nerd-fonts

## See Also

- [Nerd Fonts Official Site](https://www.nerdfonts.com/)
- [MPlus Font Family](https://mplusfonts.github.io/)
- [Fontconfig Documentation](https://www.freedesktop.org/wiki/Software/fontconfig/)
