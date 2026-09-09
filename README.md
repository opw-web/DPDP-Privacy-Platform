# DPDP Privacy Platform — Client Evaluation

A ready-to-explore sample of the DPDP Privacy Platform, packaged to run on a **Windows 10 or 11**
laptop with nothing to configure.

**The client guide is the document to follow.** It starts at the folder you unzip and runs all the
way through setup, a guided product tour and a clean shutdown. This page only gets you as far as
opening it.

> **This is a demonstration environment.** Acme Retail, its employees, customers, requests,
> consents, incidents and all other records are fictional. A real deployment is configured with your
> organisation's approved data sources, policies, roles, notices, languages and workflows.

## 1. What this computer needs

If this laptop was supplied with the platform already prepared, everything is installed and you can
skip to step 3.

| Program | Where it comes from | Why it is needed |
| --- | --- | --- |
| **Docker Desktop** | <https://www.docker.com/products/docker-desktop/> | Runs the database, cache and mail catcher |
| **Node.js 20** | <https://nodejs.org/> | Runs the application. Version 20 specifically — 22 and later are not what this platform is built against |
| **Python 3** | <https://www.python.org/downloads/windows/> | Used by the setup control. Tick **Add python.exe to PATH** during installation |
| **Git for Windows** | <https://git-scm.com/download/win> | Supplies Git Bash, which the numbered controls run through |
| **Visual Studio Build Tools 2022** | <https://visualstudio.microsoft.com/downloads/>, under "Tools for Visual Studio" | Compiles one security component during setup. Choose the **Desktop development with C++** workload |
| A web browser | Chrome, Edge or similar | Everything you look at is a web page served by this computer |

An internet connection is needed for the one-time setup. After that the evaluation runs offline.

An administrator can install most of these in one go from an **elevated** PowerShell window:

```powershell
winget install -e --id Git.Git --source winget
winget install -e --id Python.Python.3.12 --source winget
winget install -e --id Docker.DockerDesktop --source winget
winget install -e --id Microsoft.WSL --source winget
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --source winget `
  --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Node 20 is not in winget, which now carries only newer releases, so install it from the nodejs.org
link above. After installing anything, close and reopen any terminal window so the new PATH is
picked up.

> **Why the C++ Build Tools are needed:** one of the platform's security components (the `argon2`
> password hasher) has no usable pre-built Windows binary and is compiled during setup. Without that
> workload, setup stops with a `gyp ERR! find VS` message. It is a one-time install of roughly
> 2–4 GB and needs an administrator.

> **If Python seems installed but nothing works:** Windows ships placeholder shortcuts named
> `python` and `python3` that only open the Microsoft Store. Turn them off under **Settings → Apps →
> Advanced app settings → App execution aliases**, switching off both Python entries.

Start Docker Desktop and leave it running before setup: the whale icon sits in the system tray and
the window says **Engine running**. The first time Docker Desktop runs it turns on Windows Subsystem
for Linux and asks to restart the computer. That is expected.

## 2. Download and unzip

1. Sign in to GitHub and open this repository.
2. Click the green **Code** button, then **Download ZIP**.
3. Open your **Downloads** folder, right-click the ZIP and choose **Extract All…**.
4. Extract it somewhere short and local such as `C:\DPDP` — **not** inside OneDrive, and never left
   unopened inside the ZIP. The controls cannot run from a ZIP preview.
5. Open the extracted `DPDP-Privacy-Platform-…` folder.

## 3. Open the client guide and follow it

Double-click **2 - Client Guide**. If it does not open, open
[`docs/demo-runbook/CLIENT-GUIDE-standalone.html`](docs/demo-runbook/CLIENT-GUIDE-standalone.html)
in a browser — it is a single self-contained file with its screenshots inside, and can be read
before anything is installed.

The guide takes it from there: the one-time setup (button 0), starting the platform, the guided
product tour, inspecting the underlying data, and stopping safely. Allow about 15 minutes of setup
and about 30 minutes of guided reading.

## The eight controls

They sit in the folder you unzipped, and setup also places them on your Desktop.

| Button | What it does |
| --- | --- |
| **0 - Prepare This Computer** | One-time setup after downloading |
| **1 - Start Privacy Demo** | Starts the platform and opens it in your browser |
| **2 - Client Guide** | Opens the guided product evaluation |
| **3 - Open Database** | Browses the sample database table by table |
| **4 - Show Demo Proof** | Live counts read from the running environment |
| **5 - Demo Status** | Shows what is running |
| **6 - Stop Privacy Demo** | Stops everything, keeping the sample data |
| **9 - Reset Demo to Fresh State** | Destroys and rebuilds the sample data — not during an evaluation |

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

- [Standalone client guide](docs/demo-runbook/CLIENT-GUIDE-standalone.html) — the self-guided
  evaluation, start to finish
- [Standalone presenter runbook](docs/demo-runbook/RUNBOOK-standalone.html) — for someone
  demonstrating the platform to others

The editable source files and image folder remain in `docs/demo-runbook/`.

<details>
<summary><b>Running it on Linux</b></summary>

The demo control layer is the same set of `bash` scripts on both systems; only the entry points
differ.

- Prerequisites: Docker Engine or Docker Desktop running, Node.js 20 through `nvm`, the PostgreSQL
  client tools (`psql`), `xdg-utils`, and a web browser. No compiler is needed.
- The numbered `.cmd` files in the root are Windows launchers. The matching Linux entry points are
  in `demo-control/linux/`, for example
  `bash "demo-control/linux/0 - Prepare This Computer.sh"`.
- `demo-control/install-launchers.sh` places the same eight buttons on the Desktop and in the
  applications menu as trusted `.desktop` entries.

</details>
