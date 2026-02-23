#!/usr/bin/env python3
"""
LV2 user-space installer for Fedora Server.

Installs ONLY into ~/.lv2 by downloading and extracting upstream archives OR Fedora RPMs (downloaded from Koji),
then copying *.lv2 bundle directories into ~/.lv2.

Features:
- install/uninstall CLI + curses TUI selector
- Optional helper tools auto-installed via dnf (and removed afterward if they weren't present before):
  - 7z (for LSP .7z)
  - rpm2cpio + cpio (for RPM extraction)
  - tar (fallback)
  - unzip (if needed)
  - dpkg-deb (if you later add DEB sources)

New in this update:
- Supports Fedora-packaged LV2 plugins by downloading RPMs from Fedora Koji automatically (no system install).
  Uses Koji XML-RPC (stdlib xmlrpc.client) to locate the latest tagged build for your Fedora release tag (fNN-updates)
  and then downloads RPM payloads from kojipkgs.fedoraproject.org.

Note:
- This is best-effort. If Koji is unreachable from your environment, RPM installs will fail gracefully.

chmod +x lv2_user_installer.py
./lv2_user_installer.py tui

./lv2_user_installer.py install --id 1 --id 3 --id 12 --id 17 --id 24
./lv2_user_installer.py uninstall --id 12





"""

from __future__ import annotations

import argparse
import curses
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import xmlrpc.client
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

LV2_DIR = Path.home() / ".lv2"
CACHE_DIR = Path.home() / ".cache" / "lv2-user-installer"
STATE_FILE = LV2_DIR / ".lv2-user-installer-state.json"

# Fedora Koji hub + package download base
KOJI_HUB = "https://koji.fedoraproject.org/kojihub"
KOJIPKGS_TOPURL = "https://kojipkgs.fedoraproject.org/packages"

# -----------------------------
# Models
# -----------------------------
@dataclass(frozen=True)
class PluginItem:
    id: int
    name: str
    group: str
    supported: bool
    method: str = ""  # "tar", "zip", "7z", "run", "rpm", "deb", "koji_rpm"
    url: Optional[str] = None   # direct URL for archive/rpm/deb (not needed for koji_rpm)
    note: str = ""

    # For koji_rpm installs:
    koji_rpms: Optional[List[str]] = None  # list of rpm package names to fetch (e.g. ["lv2-x42-plugins"])


# -----------------------------
# Helpers: process, tools, packages
# -----------------------------
def have_cmd(cmd: str) -> bool:
    return shutil.which(cmd) is not None

def is_root() -> bool:
    return os.geteuid() == 0

def run_cmd(cmd: List[str], check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    if capture:
        return subprocess.run(cmd, check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return subprocess.run(cmd, check=check)

def sudo_prefix() -> List[str]:
    if is_root():
        return []
    if have_cmd("sudo"):
        return ["sudo"]
    raise RuntimeError("This operation needs root privileges to install helper tools (sudo not found).")

TOOL_TO_PKG = {
    "7z": "p7zip",
    "unzip": "unzip",
    "zstd": "zstd",
    "rpm2cpio": "rpm",
    "cpio": "cpio",
    "dpkg-deb": "dpkg",
    "tar": "tar",
}

def rpm_is_installed(pkg: str) -> bool:
    p = run_cmd(["rpm", "-q", pkg], check=False)
    return p.returncode == 0

def ensure_tools(tools: Set[str], session_installed_pkgs: Set[str], preinstalled_pkgs: Set[str]) -> None:
    missing_cmds = [t for t in tools if not have_cmd(t)]
    if not missing_cmds:
        return

    pkgs: Set[str] = set()
    for t in missing_cmds:
        pkg = TOOL_TO_PKG.get(t)
        if not pkg:
            raise RuntimeError(f"No known Fedora package mapping for required tool: {t}")
        pkgs.add(pkg)

    to_install = [p for p in sorted(pkgs) if not rpm_is_installed(p)]
    if to_install:
        print(f"[deps] Installing helper packages: {' '.join(to_install)}", file=sys.stderr)
        run_cmd(sudo_prefix() + ["dnf", "-y", "install"] + to_install, check=True)
        for p in to_install:
            if p not in preinstalled_pkgs:
                session_installed_pkgs.add(p)

    still_missing = [t for t in tools if not have_cmd(t)]
    if still_missing:
        raise RuntimeError(f"After installing deps, still missing tools: {', '.join(still_missing)}")

def cleanup_session_packages(session_installed_pkgs: Set[str]) -> None:
    if not session_installed_pkgs:
        return
    to_remove = sorted(session_installed_pkgs)
    print(f"[deps] Removing helper packages installed by this script: {' '.join(to_remove)}", file=sys.stderr)
    run_cmd(sudo_prefix() + ["dnf", "-y", "remove"] + to_remove, check=False)


# -----------------------------
# Download / extract / install logic
# -----------------------------
def mkdirp(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def download(url: str, dst: Path) -> None:
    mkdirp(dst.parent)
    req = urllib.request.Request(url, headers={"User-Agent": "lv2-user-installer/2.1 (Fedora; urllib)"})
    with urllib.request.urlopen(req) as r, dst.open("wb") as f:
        shutil.copyfileobj(r, f)

def find_lv2_dirs(root: Path) -> List[Path]:
    return [p for p in root.rglob("*.lv2") if p.is_dir()]

def copy_lv2_dirs_to_user(lv2_dirs: List[Path]) -> List[Path]:
    mkdirp(LV2_DIR)
    installed: List[Path] = []
    for src in lv2_dirs:
        dest = LV2_DIR / src.name
        tmp = LV2_DIR / f".{src.name}.tmp"
        if tmp.exists():
            shutil.rmtree(tmp)
        shutil.copytree(src, tmp, symlinks=True)
        if dest.exists():
            shutil.rmtree(dest)
        tmp.rename(dest)
        installed.append(dest)
    return installed

def load_state() -> Dict[str, Dict]:
    if not STATE_FILE.exists():
        return {"installed": {}}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"installed": {}}

def save_state(state: Dict[str, Dict]) -> None:
    mkdirp(LV2_DIR)
    STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")

def record_install(item: PluginItem, bundles: List[Path]) -> None:
    state = load_state()
    inst = state.setdefault("installed", {})
    inst[str(item.id)] = {"name": item.name, "bundles": [b.name for b in bundles]}
    save_state(state)

def uninstall_item(item: PluginItem) -> Tuple[int, str]:
    state = load_state()
    inst = state.get("installed", {})
    entry = inst.get(str(item.id))
    if not entry:
        return 0, "Not installed (no record in state)."

    removed = 0
    missing = 0
    for bname in entry.get("bundles", []):
        target = LV2_DIR / bname
        if target.exists() and target.is_dir():
            shutil.rmtree(target)
            removed += 1
        else:
            missing += 1

    inst.pop(str(item.id), None)
    state["installed"] = inst
    save_state(state)

    msg = f"Removed {removed} bundle(s)."
    if missing:
        msg += f" ({missing} recorded bundle(s) were already missing.)"
    return removed, msg

def extract_tar(archive: Path, out_dir: Path) -> None:
    try:
        with tarfile.open(archive, "r:*") as tf:
            tf.extractall(path=out_dir)
    except Exception:
        if not have_cmd("tar"):
            raise RuntimeError("Unable to extract tar archive (tarfile failed and 'tar' not available).")
        run_cmd(["tar", "-xf", str(archive), "-C", str(out_dir)], check=True)

def extract_zip(archive: Path, out_dir: Path) -> None:
    import zipfile
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(out_dir)

def extract_7z(archive: Path, out_dir: Path) -> None:
    run_cmd(["7z", "x", f"-o{out_dir}", str(archive)], check=True)

def extract_run_makeself(archive: Path, out_dir: Path) -> None:
    archive.chmod(archive.stat().st_mode | 0o111)
    run_cmd([str(archive), "--noexec", "--target", str(out_dir)], check=True)

def extract_rpm(archive: Path, out_dir: Path) -> None:
    # rpm2cpio <rpm> | cpio -idmv -D <out_dir>
    p1 = subprocess.Popen(["rpm2cpio", str(archive)], stdout=subprocess.PIPE)
    p2 = subprocess.Popen(
        ["cpio", "-idmv", "-D", str(out_dir)],
        stdin=p1.stdout,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    p1.stdout.close()
    _out, err = p2.communicate()
    if p2.returncode != 0:
        raise RuntimeError(f"RPM extraction failed: {err.strip()}")

def extract_deb(archive: Path, out_dir: Path) -> None:
    run_cmd(["dpkg-deb", "-x", str(archive), str(out_dir)], check=True)

def detect_fedora_version_id() -> Optional[str]:
    # /etc/os-release VERSION_ID="42"
    try:
        for line in Path("/etc/os-release").read_text(encoding="utf-8").splitlines():
            if line.startswith("VERSION_ID="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                return v
    except Exception:
        return None
    return None

def detect_arch() -> str:
    m = platform.machine().lower()
    if m in ("x86_64", "amd64"):
        return "x86_64"
    if m in ("aarch64", "arm64"):
        return "aarch64"
    return m

def koji_session() -> xmlrpc.client.ServerProxy:
    return xmlrpc.client.ServerProxy(KOJI_HUB, allow_none=True)

def koji_find_latest_build(tag: str, package_name: str) -> Optional[Dict]:
    """
    Uses Koji listTagged(tag, latest=True, package=package_name, inherit=True).
    Returns a build dict or None.
    """
    s = koji_session()
    try:
        builds = s.listTagged(tag, inherit=True, latest=True, package=package_name, strict=False)
        if builds:
            return builds[0]
        return None
    except Exception:
        return None

def koji_list_rpms_for_build(build_id: int) -> List[Dict]:
    s = koji_session()
    return s.listRPMs(buildID=build_id)

def koji_rpm_url(rpm: Dict) -> str:
    """
    Construct a Koji package URL for an RPM.
    Common convention: https://kojipkgs.fedoraproject.org/packages/<name>/<version>/<release>/<arch>/<nvra>.rpm
    """
    name = rpm["name"]
    version = rpm["version"]
    release = rpm["release"]
    arch = rpm["arch"]
    nvra = f"{name}-{version}-{release}.{arch}.rpm"
    return f"{KOJIPKGS_TOPURL}/{name}/{version}/{release}/{arch}/{nvra}"

def install_from_direct_url(item: PluginItem, session_installed_pkgs: Set[str], preinstalled_pkgs: Set[str]) -> Tuple[List[Path], str]:
    assert item.url
    needed_tools: Set[str] = set()
    if item.method == "tar":
        needed_tools |= {"tar"}
    elif item.method == "7z":
        needed_tools |= {"7z"}
    elif item.method == "rpm":
        needed_tools |= {"rpm2cpio", "cpio"}
    elif item.method == "deb":
        needed_tools |= {"dpkg-deb"}
    elif item.method == "zip":
        pass
    elif item.method == "run":
        pass
    else:
        raise RuntimeError(f"Unknown install method: {item.method}")

    ensure_tools(needed_tools, session_installed_pkgs, preinstalled_pkgs)

    mkdirp(CACHE_DIR)
    fname = item.url.split("/")[-1] or f"item-{item.id}"
    dl_path = CACHE_DIR / fname
    if not dl_path.exists():
        print(f"[dl] {item.url}", file=sys.stderr)
        download(item.url, dl_path)

    with tempfile.TemporaryDirectory(prefix="lv2-inst-") as td:
        tdir = Path(td)

        if item.method == "tar":
            extract_tar(dl_path, tdir)
        elif item.method == "zip":
            extract_zip(dl_path, tdir)
        elif item.method == "7z":
            extract_7z(dl_path, tdir)
        elif item.method == "run":
            extract_run_makeself(dl_path, tdir)
        elif item.method == "rpm":
            extract_rpm(dl_path, tdir)
        elif item.method == "deb":
            extract_deb(dl_path, tdir)

        lv2_dirs = find_lv2_dirs(tdir)
        if not lv2_dirs:
            raise RuntimeError("No *.lv2 directories found after extraction.")

        installed = copy_lv2_dirs_to_user(lv2_dirs)
        record_install(item, installed)
        return installed, f"Installed {len(installed)} bundle(s): " + ", ".join(p.name for p in installed)

def install_from_koji_rpms(item: PluginItem, session_installed_pkgs: Set[str], preinstalled_pkgs: Set[str]) -> Tuple[List[Path], str]:
    """
    For each rpm package name in item.koji_rpms:
      - find latest build tagged for this Fedora release
      - download matching RPM(s) for our arch (and noarch when relevant)
      - extract payload
      - copy *.lv2 dirs to ~/.lv2
    """
    if not item.koji_rpms:
        raise RuntimeError("koji_rpm method requires koji_rpms list")

    ensure_tools({"rpm2cpio", "cpio"}, session_installed_pkgs, preinstalled_pkgs)

    fed = detect_fedora_version_id()
    if not fed:
        raise RuntimeError("Could not detect Fedora VERSION_ID from /etc/os-release")

    arch = detect_arch()

    # Prefer updates tag, fallback to base tag
    tags_to_try = [f"f{fed}-updates", f"f{fed}"]

    all_installed: List[Path] = []
    with tempfile.TemporaryDirectory(prefix="lv2-koji-") as td:
        tdir = Path(td)
        mkdirp(CACHE_DIR)

        for pkgname in item.koji_rpms:
            build = None
            used_tag = None
            for tag in tags_to_try:
                build = koji_find_latest_build(tag, pkgname)
                if build:
                    used_tag = tag
                    break
            if not build:
                raise RuntimeError(f"Koji: no tagged build found for {pkgname} in tags {tags_to_try}")

            build_id = build["build_id"]
            rpms = koji_list_rpms_for_build(build_id)

            # Pick best rpms: prefer exact arch + noarch
            wanted_arches = {arch, "noarch"}
            chosen = [r for r in rpms if r.get("arch") in wanted_arches and r.get("name") == pkgname]

            # Some packages have multiple subpackages / multilib naming; if none match exact name, accept any rpm with same build and arch that matches package
            if not chosen:
                chosen = [r for r in rpms if r.get("arch") in wanted_arches and r.get("name", "").startswith(pkgname)]

            if not chosen:
                raise RuntimeError(f"Koji: no RPMs found for {pkgname} (build {build.get('nvr')}) for arches {wanted_arches}")

            for r in chosen:
                url = koji_rpm_url(r)
                fname = url.split("/")[-1]
                dl_path = CACHE_DIR / fname
                if not dl_path.exists():
                    print(f"[koji:{used_tag}] {url}", file=sys.stderr)
                    download(url, dl_path)
                # extract into unique subdir
                pkg_out = tdir / f"{pkgname}-{r['arch']}"
                mkdirp(pkg_out)
                extract_rpm(dl_path, pkg_out)

        lv2_dirs = find_lv2_dirs(tdir)
        if not lv2_dirs:
            raise RuntimeError("No *.lv2 directories found after extracting Koji RPM payload(s).")

        all_installed = copy_lv2_dirs_to_user(lv2_dirs)
        record_install(item, all_installed)
        return all_installed, f"Installed {len(all_installed)} bundle(s): " + ", ".join(p.name for p in all_installed)


def install_item(item: PluginItem, session_installed_pkgs: Set[str], preinstalled_pkgs: Set[str]) -> Tuple[List[Path], str]:
    if not item.supported:
        raise RuntimeError("Item is not supported.")

    if item.method == "koji_rpm":
        return install_from_koji_rpms(item, session_installed_pkgs, preinstalled_pkgs)

    if not item.url:
        raise RuntimeError("Item missing URL for direct install method.")
    return install_from_direct_url(item, session_installed_pkgs, preinstalled_pkgs)


# -----------------------------
# Catalog (Items 1–25)
# -----------------------------
def catalog() -> List[PluginItem]:
    # Note: For Koji RPM installs, we use package names that exist in Fedora repos.
    # If your target Fedora release lacks one of these package names, Koji lookup will fail.
    return [
        # x42 (Fedora package: lv2-x42-plugins)
        PluginItem(1, "x42 EBU R128 Meter (meters.lv2)", "Metering", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-x42-plugins"],
                   note="Fedora Koji RPM extraction -> copies *.lv2 into ~/.lv2"),
        PluginItem(2, "x42 Meter Collection", "Metering", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-x42-plugins"],
                   note="Same Fedora package as #1"),
        # LSP (7z)
        PluginItem(3, "LSP Analyzer / Spectrum tools (LSP Plugins)", "Analysis", True,
                   method="7z",
                   url="https://github.com/sadko4u/lsp-plugins/releases/download/1.2.26/lsp-plugins-1.2.26-Linux-x86_64.7z",
                   note="Extract .7z -> copies included *.lv2 into ~/.lv2"),
        # x42 EQ
        PluginItem(4, "x42 EQ", "EQ", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-x42-plugins"],
                   note="Fedora Koji RPM extraction"),
        # EQ10Q (.run)
        PluginItem(5, "EQ10Q (LV2 bundle)", "EQ", True,
                   method="run",
                   url="https://sourceforge.net/projects/eq10q/files/eq10q_2.2_installer.run/download",
                   note="Extracts .run -> copies *.lv2 into ~/.lv2"),
        # LSP EQ/Comp/Limiter (same 7z)
        PluginItem(6, "LSP Parametric EQ (LSP Plugins)", "EQ", True,
                   method="7z",
                   url="https://github.com/sadko4u/lsp-plugins/releases/download/1.2.26/lsp-plugins-1.2.26-Linux-x86_64.7z",
                   note="Same LSP bundle as #3"),
        PluginItem(7, "LSP Compressor (LSP Plugins)", "Dynamics", True,
                   method="7z",
                   url="https://github.com/sadko4u/lsp-plugins/releases/download/1.2.26/lsp-plugins-1.2.26-Linux-x86_64.7z",
                   note="Same LSP bundle as #3"),
        PluginItem(8, "LSP Limiter / True Peak options (LSP Plugins)", "Dynamics", True,
                   method="7z",
                   url="https://github.com/sadko4u/lsp-plugins/releases/download/1.2.26/lsp-plugins-1.2.26-Linux-x86_64.7z",
                   note="Same LSP bundle as #3"),
        # x42 limiter
        PluginItem(9, "x42 Limiter (x42 ecosystem)", "Dynamics", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-x42-plugins"],
                   note="Fedora Koji RPM extraction"),
        # ZamAudio LV2
        PluginItem(10, "ZamComp / ZamCompX2 (ZamAudio)", "Dynamics", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-zam-plugins"],
                   note="Fedora Koji RPM extraction (lv2-zam-plugins)"),
        # Invada LV2
        PluginItem(11, "Invada Compressor (Invada bundle)", "Dynamics", True,
                   method="koji_rpm",
                   koji_rpms=["invada-studio-plugins-lv2"],
                   note="Fedora Koji RPM extraction (invada-studio-plugins-lv2)"),
        # Dragonfly
        PluginItem(12, "Dragonfly Hall Reverb", "Reverb", True,
                   method="tar",
                   url="https://github.com/michaelwillis/dragonfly-reverb/releases/download/3.2.10/dragonfly-reverb-3.2.10-linux-x86_64.tar.xz",
                   note="Installs Dragonfly *.lv2 bundles"),
        PluginItem(13, "Dragonfly Plate Reverb", "Reverb", True,
                   method="tar",
                   url="https://github.com/michaelwillis/dragonfly-reverb/releases/download/3.2.10/dragonfly-reverb-3.2.10-linux-x86_64.tar.xz",
                   note="Same Dragonfly bundle as #12"),
        PluginItem(14, "Dragonfly Room Reverb", "Reverb", True,
                   method="tar",
                   url="https://github.com/michaelwillis/dragonfly-reverb/releases/download/3.2.10/dragonfly-reverb-3.2.10-linux-x86_64.tar.xz",
                   note="Same Dragonfly bundle as #12"),
        PluginItem(15, "Invada ER Reverb (Invada bundle)", "Reverb", True,
                   method="koji_rpm",
                   koji_rpms=["invada-studio-plugins-lv2"],
                   note="Same Fedora package as #11"),
        # DISTRHO Ports
        PluginItem(16, "DISTRHO KlangFalter", "Convolution", True,
                   method="tar",
                   url="https://github.com/DISTRHO/DISTRHO-Ports/releases/download/2018-04-16/klangfalter-linux64.tar.xz",
                   note="DISTRHO Ports tarball with LV2 bundle inside"),
        # Guitarix LV2 (includes GxCabinet etc.)
        PluginItem(17, "GxCabinet (Guitarix)", "Guitar", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-guitarix-plugins"],
                   note="Fedora Koji RPM extraction (lv2-guitarix-plugins)"),
        PluginItem(18, "x42 Convolver", "Convolution", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-x42-plugins"],
                   note="Fedora Koji RPM extraction"),
        PluginItem(19, "Guitarix LV2 modules", "Guitar", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-guitarix-plugins"],
                   note="Same Fedora package as #17"),
        # GxPlugins extras are not consistently in Fedora base repos; keep unsupported unless you add RPM name(s)
        PluginItem(20, "GxPlugins.lv2 (extras)", "Guitar", False,
                   note="Not enabled by default: add Fedora package name(s) if available in your release."),
        # DISTRHO instruments
        PluginItem(21, "Dexed (DISTRHO Ports build)", "Instrument", True,
                   method="tar",
                   url="https://github.com/DISTRHO/DISTRHO-Ports/releases/download/2018-04-16/dexed-linux64.tar.xz",
                   note="DISTRHO Ports tarball with LV2 bundle inside"),
        PluginItem(22, "Obxd (DISTRHO Ports build)", "Instrument", True,
                   method="tar",
                   url="https://github.com/DISTRHO/DISTRHO-Ports/releases/download/2018-04-16/obxd-linux64.tar.xz",
                   note="DISTRHO Ports tarball with LV2 bundle inside"),
        PluginItem(23, "Nekobi (DISTRHO)", "Instrument", False,
                   note="No stock-friendly LV2 binary archive; usually build from source"),
        # synthv1 / samplv1 via Fedora
        PluginItem(24, "synthv1 (rncbc) – LV2", "Instrument", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-synthv1"],
                   note="Fedora Koji RPM extraction (lv2-synthv1)"),
        PluginItem(25, "samplv1 (rncbc) – LV2", "Instrument", True,
                   method="koji_rpm",
                   koji_rpms=["lv2-samplv1"],
                   note="Fedora Koji RPM extraction (lv2-samplv1)"),
    ]


def get_item(items: List[PluginItem], item_id: int) -> PluginItem:
    for it in items:
        if it.id == item_id:
            return it
    raise KeyError(f"Unknown item id: {item_id}")


# -----------------------------
# CLI operations
# -----------------------------
def op_install(ids: List[int]) -> int:
    items = catalog()
    preinstalled_pkgs = {pkg for pkg in set(TOOL_TO_PKG.values()) if rpm_is_installed(pkg)}
    session_installed_pkgs: Set[str] = set()

    failed = 0
    try:
        for i in ids:
            it = get_item(items, i)
            print(f"\n==> INSTALL [{it.id}] {it.name}")
            if not it.supported:
                print(f"SKIP: {it.note}")
                continue
            try:
                installed, summary = install_item(it, session_installed_pkgs, preinstalled_pkgs)
                print(summary)
            except Exception as e:
                failed += 1
                print(f"ERROR: {e}", file=sys.stderr)
    finally:
        cleanup_session_packages(session_installed_pkgs)

    return 1 if failed else 0

def op_uninstall(ids: List[int]) -> int:
    items = catalog()
    failed = 0
    for i in ids:
        it = get_item(items, i)
        print(f"\n==> UNINSTALL [{it.id}] {it.name}")
        try:
            _removed, msg = uninstall_item(it)
            print(msg)
        except Exception as e:
            failed += 1
            print(f"ERROR: {e}", file=sys.stderr)
    return 1 if failed else 0


# -----------------------------
# TUI
# -----------------------------
def tui() -> int:
    items = catalog()
    selected: Set[int] = set()

    def draw(stdscr, idx: int, top: int):
        stdscr.clear()
        h, w = stdscr.getmaxyx()
        title = "LV2 User Installer — Space=toggle, Enter=install, u=uninstall, q=quit"
        stdscr.addstr(0, 0, title[: w - 1])
        stdscr.addstr(1, 0, f"LV2 dir: {LV2_DIR}   Cache: {CACHE_DIR}"[: w - 1])

        y = 3
        max_visible = max(1, h - y - 2)
        view = items[top: top + max_visible]
        for j, it in enumerate(view):
            line_idx = top + j
            mark = "[x]" if it.id in selected else "[ ]"
            sup = "OK" if it.supported else "—"
            prefix = ">" if line_idx == idx else " "
            line = f"{prefix} {mark} {it.id:2d}. ({sup}) {it.name}"
            if len(line) > w - 1:
                line = line[: w - 4] + "..."
            stdscr.addstr(y + j, 0, line)

        it = items[idx]
        stdscr.addstr(h - 2, 0, f"[{it.id}] {it.group} | Supported: {it.supported} | Method: {it.method}"[: w - 1])
        stdscr.addstr(h - 1, 0, (it.note or "")[: w - 1])
        stdscr.refresh()

    def run_install(sel_ids: List[int]) -> int:
        curses.endwin()
        return op_install(sel_ids)

    def run_uninstall(sel_ids: List[int]) -> int:
        curses.endwin()
        return op_uninstall(sel_ids)

    def _main(stdscr):
        curses.curs_set(0)
        idx = 0
        top = 0
        while True:
            h, _ = stdscr.getmaxyx()
            max_visible = max(1, h - 3 - 2)
            if idx < top:
                top = idx
            if idx >= top + max_visible:
                top = idx - max_visible + 1

            draw(stdscr, idx, top)
            ch = stdscr.getch()

            if ch in (ord("q"), 27):
                return 0
            elif ch in (curses.KEY_UP, ord("k")):
                idx = max(0, idx - 1)
            elif ch in (curses.KEY_DOWN, ord("j")):
                idx = min(len(items) - 1, idx + 1)
            elif ch == ord(" "):
                item_id = items[idx].id
                if item_id in selected:
                    selected.remove(item_id)
                else:
                    selected.add(item_id)
            elif ch in (10, 13):
                if not selected:
                    continue
                sel_ids = sorted(selected)
                selected.clear()
                return run_install(sel_ids)
            elif ch in (ord("u"), ord("U")):
                if not selected:
                    continue
                sel_ids = sorted(selected)
                selected.clear()
                return run_uninstall(sel_ids)

    return curses.wrapper(_main)


# -----------------------------
# Main
# -----------------------------
def main() -> int:
    p = argparse.ArgumentParser(description="Install/uninstall LV2 bundles into ~/.lv2 (archives + Koji RPM extraction) with temp deps and cleanup.")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("install", help="Install by item id(s)")
    pi.add_argument("--id", action="append", type=int, required=True, help="Plugin item id (repeatable)")

    pu = sub.add_parser("uninstall", help="Uninstall by item id(s) (only what this script recorded)")
    pu.add_argument("--id", action="append", type=int, required=True, help="Plugin item id (repeatable)")

    sub.add_parser("tui", help="Interactive selector (curses)")

    args = p.parse_args()
    if args.cmd == "install":
        return op_install(args.id)
    if args.cmd == "uninstall":
        return op_uninstall(args.id)
    if args.cmd == "tui":
        return tui()
    return 2


if __name__ == "__main__":
    sys.exit(main())