import os, sys, subprocess
winget = os.path.join(os.environ["USERPROFILE"], "AppData", "Local", "Microsoft", "WinGet", "Links")
os.environ["PATH"] = winget + ";" + os.environ["PATH"]
sys.exit(subprocess.call(sys.argv[1:]))
