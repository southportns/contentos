"""
Wrapper: set PATH then call douyin-ingest CLI entry point.
This ensures ffprobe/ffmpeg are findable by shutil.which()
even when the parent Node.js process has an incomplete PATH.
Also forces stdout/stderr to UTF-8 to avoid Chinese text garbling
on Windows where the default code page is cp936 (GBK).

Additionally, on Windows it auto-discovers NVIDIA CUDA runtime DLLs
installed via pip (nvidia-cublas-cu12, nvidia-cudnn-cu12, etc.)
and injects their bin directories into PATH so that ctranslate2
can find cublas64_12.dll, cudnn64_*.dll, etc. without a system-wide
CUDA Toolkit installation.
"""
import os
import sys
import glob

# Force UTF-8 stdout/stderr — Windows default is cp936 which garbles Chinese
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')


def _prepend_path(path: str) -> None:
    """Prepend a directory to PATH if it exists and isn't already there."""
    if path and os.path.isdir(path):
        current = os.environ.get("PATH", "")
        # Case-insensitive check on Windows
        lower = path.lower()
        existing = [p.lower() for p in current.split(os.pathsep) if p]
        if lower not in existing:
            os.environ["PATH"] = path + os.pathsep + current


# Prepend WinGet Links (ffmpeg/ffprobe) to PATH
_userprofile = os.environ.get("USERPROFILE", "")
_winget_links = os.path.join(_userprofile, "AppData", "Local", "Microsoft", "WinGet", "Links")
_prepend_path(_winget_links)

# Also prepend Python Scripts (douyin-ingest.exe location)
_appdata = os.environ.get("APPDATA", "")
_py_scripts = os.path.join(_appdata, "Python", "Python312", "Scripts")
_prepend_path(_py_scripts)


# ─── Auto-discover NVIDIA CUDA DLLs from pip packages ───
# ctranslate2 needs cublas64_12.dll, cudnn64_*.dll, etc.
# When installed via `pip install nvidia-cublas-cu12 nvidia-cudnn-cu12 ...`,
# the DLLs land in site-packages/nvidia/<lib>/bin/ on Windows.
def _inject_cuda_dll_paths() -> None:
    """Find nvidia/*/bin dirs under site-packages and add them to PATH."""
    try:
        import site
        site_dirs = site.getsitepackages()
    except Exception:
        site_dirs = []

    # Also check user site
    try:
        user_site = site.getusersitepackages()
        if user_site:
            site_dirs.append(user_site)
    except Exception:
        pass

    for site_dir in site_dirs:
        nvidia_base = os.path.join(site_dir, "nvidia")
        if not os.path.isdir(nvidia_base):
            continue
        # Each sub-package (cublas, cudnn, cuda_runtime, etc.) has a bin/ dir
        for entry in os.listdir(nvidia_base):
            bin_dir = os.path.join(nvidia_base, entry, "bin")
            if os.path.isdir(bin_dir):
                _prepend_path(bin_dir)


_inject_cuda_dll_paths()

# Import and run the douyin-ingest CLI
# The package installs as 'project' module with entry point project.cli:main
try:
    from project.cli import main
    main()
except ImportError:
    # Fallback: call douyin-ingest.exe directly
    import subprocess
    exe = os.path.join(_py_scripts, "douyin-ingest.exe")
    if not os.path.exists(exe):
        exe = "douyin-ingest"
    # Ensure the exe also uses UTF-8 for stdout/stderr
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    sys.exit(subprocess.call([exe] + sys.argv[1:], env=env))
