"""Compatibility facade for the package-based backup service."""

from app.services.backup import (
    BackupInfo,
    BackupService,
    BackupSettings,
    get_backup_service,
    reset_backup_service,
)

__all__ = [
    "BackupInfo",
    "BackupService",
    "BackupSettings",
    "get_backup_service",
    "reset_backup_service",
]


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="MAP2 Backup Service CLI")
    parser.add_argument(
        "--generate-rebuild-script",
        nargs="?",
        const=True,
        default=False,
        help="Generate a standalone rebuild script. Optionally specify the output path.",
    )
    args = parser.parse_args()

    if args.generate_rebuild_script:
        service = BackupService()
        output_path = (
            args.generate_rebuild_script
            if isinstance(args.generate_rebuild_script, str)
            else None
        )
        print(f"Generating rebuild script to: {output_path or service.settings.backup_location}")
        service.generate_rebuild_script(output_path=output_path)
        print("Rebuild script generated successfully.")
