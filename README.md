# DPDP Privacy Platform — Client Evaluation

This repository contains a ready-to-explore sample of the DPDP Privacy Platform. The guide assumes no technical knowledge and takes about 20 minutes.

> **This is a demonstration environment.** Acme Retail, its employees, customers, requests, consents, incidents and all other records are fictional. A real deployment is configured with your organisation's approved data sources, policies, roles, notices, languages and workflows.

## What you need

The platform runs on **Windows 10/11** or on **Ubuntu or a similar Linux computer**. Pick your section below.

If this laptop was supplied with the platform already prepared, everything is already installed. Continue to **Download and unzip**. Otherwise, ask the person who manages the computer to install the items listed for your system.

### On Windows

- **Docker Desktop**, installed and running — <https://www.docker.com/products/docker-desktop/>
- **Node.js 20** — <https://nodejs.org/> (Node 20 specifically; 22 and later are not what this platform is built against)
- **Python 3** — <https://www.python.org/downloads/windows/> (tick **Add python.exe to PATH** during setup)
- **Git for Windows** — <https://git-scm.com/download/win> (this supplies Git Bash, which the controls run through)
- **Visual Studio Build Tools 2022**, with the **Desktop development with C++** workload — <https://visualstudio.microsoft.com/downloads/> (under "Tools for Visual Studio")
- Google Chrome or another web browser
- An internet connection for the first setup

> **Why Build Tools are needed:** one of the platform's security components (the `argon2` password hasher) has no usable pre-built Windows binary and is compiled during setup. Without the C++ workload, button 0 stops with a `gyp ERR! find VS` message. This is a one-time install of about 2–4 GB and needs an administrator.

An administrator can install all of these in one go from an **elevated** PowerShell window:

```powershell
winget install -e --id Git.Git --source winget
winget install -e --id Python.Python.3.12 --source winget
winget install -e --id Docker.DockerDesktop --source winget
winget install -e --id Microsoft.WSL --source winget
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --source winget `
  --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Node 20 is not in winget (it now carries only newer releases), so install it from the nodejs.org link above. After installing, close and reopen any terminal so the new PATH is picked up.

> **If Python seems installed but nothing works:** Windows ships placeholder shortcuts named `python` and `python3` that only open the Microsoft Store. Turn them off under **Settings → Apps → Advanced app settings → App execution aliases**, and switch off both Python entries.

Docker Desktop turns on Windows Subsystem for Linux the first time it runs, and asks to restart the computer. That is expected.

### On Linux

- Docker Engine or Docker Desktop running
- Node.js 20 through `nvm`
- PostgreSQL client tools (`psql`)
- Google Chrome or another web browser
- An internet connection for the first setup

## Download and unzip

1. Sign in to GitHub and open this repository.
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Open your **Downloads** folder.
5. Right-click the downloaded ZIP and choose **Extract All…** on Windows, or **Extract Here** on Linux.
6. Open the extracted `DPDP-Privacy-Platform-mvp2-compliance-operations` folder.

On Windows, extract it somewhere short and local such as `C:\DPDP` — not inside OneDrive, and not left unopened inside the ZIP. Running the controls directly from a ZIP preview will not work.

You are now in the main folder. The numbered controls are directly visible here; they do not need to be on your Desktop.

## Which numbered files to use

The folder contains two sets of numbered controls. **Use the set for your computer and ignore the other one.**

- On **Windows**, use the files ending in **(Windows)** — for example `1 - Start Privacy Demo (Windows)`.
- On **Linux**, use the files ending in **.sh** — for example `1 - Start Privacy Demo.sh`.

Both sets do exactly the same thing.

## Prepare it once after downloading

1. Double-click **0 - Prepare This Computer** for your system (see above).
2. On Windows, if a blue **“Windows protected your PC”** box appears, choose **More info**, then **Run anyway**. This only happens the first time. On Linux, if it asks what to do, choose **Run in Terminal** or **Execute**.
3. Leave the black window open. It installs the project packages, builds the application and creates the complete fictional Acme workspace.
4. Allow about 15 minutes on the first run. Keep the internet connection on.
5. Wait for the message **Preparation complete** and press Enter.

On Windows, make sure Docker Desktop is running first — its whale icon should be in the system tray and its window should say **Engine running**.

You only need button 0 after downloading a fresh copy. Do not repeat it before each visit: normal use begins with button 1.

## The only files you need

| Open this | What it does |
|---|---|
| **0 - Prepare This Computer** | One-time setup after downloading: installs, builds and creates the sample workspace. |
| **1 - Start Privacy Demo** | Starts the local platform and opens it in your browser. |
| **2 - Client Guide** | Opens the standalone, self-guided client guide. |
| **3 - Open Database** | Opens the sample database in a visual table browser. |
| **4 - Show Demo Proof** | Displays live counts from the sample environment. |
| **5 - Demo Status** | Shows which parts are running. |
| **6 - Stop Privacy Demo** | Stops everything safely and keeps the sample data. |
| **9 - Reset Demo to Fresh State** | Deletes and rebuilds the sample data. Do not use this during an evaluation. |

Add `.sh` on Linux, or ` (Windows)` on Windows, to each name above.

The word “Demo” appears in some launcher names because these controls operate the fictional evaluation environment. It is not part of the deployed product.

## Start in four simple steps

1. Double-click **1 - Start Privacy Demo** for your system.
2. On Windows, accept the Windows Firewall prompt if one appears — the platform runs entirely on this computer, but Windows still asks. On Linux, if it asks what to do, choose **Run in Terminal** or **Execute**; do not choose “Display”.
3. Wait until the black window says the platform is ready. Your browser should open automatically at `http://localhost:5173`.
4. Double-click **2 - Client Guide** and follow it from the top.

The guide uses the same numbered controls you see in the main folder. Whenever it says to use a numbered Desktop button, use the matching numbered file here.

Direct guide link: [Open the standalone client guide](docs/demo-runbook/CLIENT-GUIDE-standalone.html)

## Sign-in details

For the staff view:

- Address: `http://localhost:5173/login`
- Email: `admin@acmeretail.demo`
- Password: `Password123!`

For the individual view used later in the guide:

- Address: `http://localhost:5173/me/login`
- Email: `aman.sharma@gmail.com`
- Password: `Password123!`

These are sample accounts containing demonstration data only.

## If double-click does not run the file

### On Windows

If a blue **“Windows protected your PC”** box appears, choose **More info**, then **Run anyway**. This is SmartScreen reacting to a file downloaded from the internet, and only happens once per file.

If the window flashes open and closes immediately, Git for Windows is probably missing. Install it from <https://git-scm.com/download/win> and try again.

### On Linux

Some Linux file managers do not run scripts by default.

1. Right-click the numbered file and choose **Properties**.
2. Open **Permissions**.
3. Enable **Allow executing file as program**.
4. Close Properties and double-click the file again.

If your file manager still opens it as text, right-click an empty area in the folder, choose **Open in Terminal**, and run:

```bash
bash "1 - Start Privacy Demo.sh"
```

You do not need to type any application commands after that.

## When you finish

1. Double-click **6 - Stop Privacy Demo** for your system.
2. Wait for **Everything is stopped**.
3. Press Enter and close the browser.

Stopping keeps the sample state. The next time you use button 1, the same requests, consents and incident will return.

## Quick help

| Problem | What to do |
|---|---|
| Browser did not open | Open `http://localhost:5173` yourself. |
| Page does not load | Wait 20 seconds and refresh once. |
| Still not working | Run **5 - Demo Status**, then run button 6 followed by button 1. |
| Login is refused | Check the address: staff use `/login`; individuals use `/me/login`. Include the `!` in the password. |
| Database browser does not open | Start the environment with button 1 first. |
| A numbered file opens as text, or the window vanishes | Follow **If double-click does not run the file** above. |
| Button 0 says a required program is missing | Ask the computer administrator to install the program named in the window, then run button 0 again. |
| Windows: button 0 says Docker is not answering | Open Docker Desktop, wait until it says **Engine running**, then run button 0 again. |
| Windows: button 0 says Python is not usable | Install Python 3, then switch off the Microsoft Store aliases as described in **What you need**. |
| Windows: button 0 log shows `gyp ERR! find VS` | Visual Studio Build Tools with the **Desktop development with C++** workload is missing. See **What you need**. |
| Windows: Docker Desktop will not start | It needs WSL2. An administrator should run `wsl --install`, then restart if prompted. |
| You want a clean sample | Ask the environment owner before using button 9; rebuilding takes about 12 minutes. |

## Share the guides as single files

Both shareable guides contain their screenshots inside the HTML, so no image folder is required:

- [Standalone client guide](docs/demo-runbook/CLIENT-GUIDE-standalone.html)
- [Standalone presenter runbook](docs/demo-runbook/RUNBOOK-standalone.html)

The editable source files and image folder remain in `docs/demo-runbook/`.
