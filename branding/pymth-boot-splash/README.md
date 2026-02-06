# Pymth Boot Splash - Plymouth Theme

A professional boot splash theme for the Mackes Audio Platform featuring startup progress display.

## Features

- **Mackes Audio Platform Branding**: Orange grid logo and color scheme
- **Startup Progress Indicator**: Visual progress bar showing boot progress
- **Percentage Display**: Real-time percentage counter
- **Status Messages**: Dynamic status updates during boot
- **Grid Pattern Background**: Subtle grid aesthetic matching the platform's design
- **Smooth Animations**: Fluid progress transitions

## Installation

### On Fedora/RHEL Systems

1. Copy the theme directory to Plymouth themes:
```bash
sudo cp -r pymth-boot-splash /usr/share/plymouth/themes/
```

2. Set as the default theme:
```bash
sudo plymouth-set-default-theme pymth-boot-splash
```

3. Rebuild the initramfs to include the new theme:
```bash
sudo dracut -f
```

### On Debian/Ubuntu Systems

1. Copy the theme directory:
```bash
sudo cp -r pymth-boot-splash /usr/share/plymouth/themes/
```

2. Set as the default theme:
```bash
sudo update-alternatives --install /usr/share/plymouth/themes/default.plymouth default.plymouth /usr/share/plymouth/themes/pymth-boot-splash/pymth-boot-splash.plymouth 100
sudo update-alternatives --set default.plymouth /usr/share/plymouth/themes/pymth-boot-splash/pymth-boot-splash.plymouth
```

3. Update initramfs:
```bash
sudo update-initramfs -u
```

## Theme Files

- **pymth-boot-splash.plymouth**: Theme metadata and configuration
- **pymth-boot-splash.script**: Main theme script with progress handling, animations, and graphics rendering

## Color Scheme

- **Dark Background**: `#0f1423` (Deep dark blue)
- **Primary Orange**: `#ff8c43` (Bright orange for logo and progress)
- **Grid Pattern**: `#182335` (Dark blue for subtle grid lines)
- **Text**: `#f2f6ff` (Light text for readability)
- **Progress Bar**: Orange fill with semi-transparent dark background

## Progress Features

The theme displays:
- Animated progress bar filling left to right
- Percentage counter (0-100%)
- Dynamic status messages for different boot phases
- Smooth transitions between progress states

## Boot Messages Handled

- **fsck-progress**: Filesystem checking
- **fsck-pass**: Filesystem check complete
- **network-up**: Network initialization complete
- **plymouth-system-ready**: System preparation done
- **boot-finished**: Boot complete

## Testing

To test the theme without rebooting:

```bash
sudo plymouthd --debug --debug-file=/tmp/plymouth-debug.log
sudo plymouth show-splash
sudo plymouth update --status="Testing progress..."
sudo plymouth update --progress=0.5
```

## Customization

You can customize the theme by editing `pymth-boot-splash.script`:

- **Colors**: Modify the `color.*` variables at the top
- **Logo Size**: Change `grid_size` and `grid_spacing` variables
- **Progress Bar Position**: Adjust `progress_y` and `progress_x`
- **Font**: Modify `DrawString` calls to use different fonts
- **Messages**: Update `display_message_callback` for custom status text

## Dependencies

- Plymouth (typically pre-installed on modern Linux systems)
- DejaVu Sans font (usually pre-installed)

## Notes

- This theme is designed for 1920x1080 and scales to other resolutions
- The progress indicator follows system boot progress
- The orange color scheme matches the Mackes Audio Platform branding
- Grid background adds visual interest while maintaining professionalism
