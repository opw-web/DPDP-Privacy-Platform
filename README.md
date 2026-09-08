# DPDP Privacy Platform — Client Evaluation

This repository contains a ready-to-explore sample of the DPDP Privacy Platform.

**The client guide is the document to follow.** It starts at the folder you unzip and runs all the way through setup, the guided tour and a clean shutdown. This page only gets you as far as opening it.

> **This is a demonstration environment.** Acme Retail, its employees, customers, requests, consents, incidents and all other records are fictional. A real deployment is configured with your organisation's approved data sources, policies, roles, notices, languages and workflows.

## 1. What you need

The platform runs on **Windows 10/11** or on **Ubuntu or a similar Linux computer**.

If this laptop was supplied with the platform already prepared, everything is installed. Otherwise, ask the person who manages the computer to install the items for your system.

### On Windows

- **Docker Desktop**, installed and running — <https://www.docker.com/products/docker-desktop/>
- **Node.js 20** — <https://nodejs.org/> (Node 20 specifically; 22 and later are not what this platform is built against)
- **Python 3** — <https://www.python.org/downloads/windows/> (tick **Add python.exe to PATH** during setup)
- **Git for Windows** — <https://git-scm.com/download/win> (this supplies Git Bash, which the controls run through)
- **Visual Studio Build Tools 2022**, with the **Desktop development with C++** workload — <https://visualstudio.microsoft.com/downloads/> (under "Tools for Visual Studio")
- Google Chrome or another web browser
- An internet connection for the first setup

An administrator can install most of these in one go from an **elevated** PowerShell window:

```powershell
winget install -e --id Git.Git --source winget
winget install -e --id Python.Python.3.12 --source winget
winget install -e --id Docker.DockerDesktop --source winget
winget install -e --id Microsoft.WSL --source winget
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --source winget `
  --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Node 20 is not in winget (it now carries only newer releases), so install it from the nodejs.org link above. After installing, close and reopen any terminal so the new PATH is picked up.

> **Why Build Tools are needed:** one of the platform's security components (the `argon2` password hasher) has no usable pre-built Windows binary and is compiled during setup. Without the C++ workload, setup stops with a `gyp ERR! find VS` message. This is a one-time install of about 2–4 GB and needs an administrator.

> **If Python seems installed but nothing works:** Windows ships placeholder shortcuts named `python` and `python3` that only open the Microsoft Store. Turn them off under **Settings → Apps → Advanced app settings → App execution aliases**, and switch off both Python entries.

Docker Desktop turns on Windows Subsystem for Linux the first time it runs, and asks to restart the computer. That is expected.

### On Linux

- Docker Engine or Docker Desktop running
- Node.js 20 through `nvm`
- PostgreSQL client tools (`psql`)
- Google Chrome or another web browser
- An internet connection for the first setup

## 2. Download and unzip

1. Sign in to GitHub and open this repository.
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Open your **Downloads** folder.
5. Right-click the downloaded ZIP and choose **Extract All…** on Windows, or **Extract Here** on Linux.
6. Open the extracted `DPDP-Privacy-Platform-mvp2-compliance-operations` folder.

On Windows, extract it somewhere short and local such as `C:\DPDP` — not inside OneDrive, and not left unopened inside the ZIP. Running the controls directly from a ZIP preview will not work.

## 3. Open the client guide and follow it

Double-click **2 - Client Guide (Windows)** on Windows, or **2 - Client Guide.sh** on Linux. If neither runs, open [`docs/demo-runbook/CLIENT-GUIDE-standalone.html`](docs/demo-runbook/CLIENT-GUIDE-standalone.html) in a browser — it is a single self-contained file with its screenshots inside, and can be read before anything is installed.

The guide takes it from there: which numbered controls belong to your system, the one-time setup (button 0), starting the platform, a twelve-stop product tour, inspecting the underlying data, and stopping safely. It takes about 15 minutes of setup and about 20 minutes of guided reading.

## Sign-in details

For the staff view:

- Address: `http://localhost:5173/login`
- Email: `admin@acmeretail.demo`
- Password: `Password123!`

For the individual view used later in the guide:

- Address: `http://localhost:5173/me/login`
- Email: `aman.sharma@gmail.com`
- Password: `Password123!`

These are sample accounts containing demonstration data only. The guide lists the rest.

## The two shareable guides

Both contain their screenshots inside the HTML, so no image folder is required:

- [Standalone client guide](docs/demo-runbook/CLIENT-GUIDE-standalone.html) — the self-guided evaluation, start to finish
- [Standalone presenter runbook](docs/demo-runbook/RUNBOOK-standalone.html) — for someone demonstrating the platform to others

The editable source files and image folder remain in `docs/demo-runbook/`.
