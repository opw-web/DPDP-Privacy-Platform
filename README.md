# DPDP Privacy Platform — Client Evaluation

This repository contains a ready-to-explore sample of the DPDP Privacy Platform. The guide assumes no technical knowledge and takes about 20 minutes.

> **This is a demonstration environment.** Acme Retail, its employees, customers, requests, consents, incidents and all other records are fictional. A real deployment is configured with your organisation's approved data sources, policies, roles, notices, languages and workflows.

## What you need

Use an Ubuntu or similar Linux computer with:

- Docker Engine or Docker Desktop running
- Node.js 20 through `nvm`
- PostgreSQL client tools (`psql`)
- Google Chrome or another web browser
- An internet connection for the first setup

If this laptop was supplied with the platform already prepared, these are already installed. Continue to **Download and unzip**. Otherwise, ask the person who manages the computer to install them before continuing.

## Download and unzip

1. Sign in to GitHub and open this repository.
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Open your **Downloads** folder.
5. Right-click the downloaded ZIP and choose **Extract Here**.
6. Open the extracted `DPDP-Privacy-Platform-mvp2-compliance-operations` folder.

You are now in the main folder. The numbered controls are directly visible here; they do not need to be on your Desktop.

## Prepare it once after downloading

1. Double-click **0 - Prepare This Computer.sh**.
2. If Linux asks what to do, choose **Run in Terminal** or **Execute**.
3. Leave the black window open. It installs the project packages, builds the application and creates the complete fictional Acme workspace.
4. Allow about 15 minutes on the first run. Keep the internet connection on.
5. Wait for the message **Preparation complete** and press Enter.

You only need button 0 after downloading a fresh copy. Do not repeat it before each visit: normal use begins with button 1.

## The only files you need

| Open this | What it does |
|---|---|
| **0 - Prepare This Computer.sh** | One-time setup after downloading: installs, builds and creates the sample workspace. |
| **1 - Start Privacy Demo.sh** | Starts the local platform and opens it in your browser. |
| **2 - Client Guide.sh** | Opens the standalone, self-guided client guide. |
| **3 - Open Database.sh** | Opens the sample database in a visual table browser. |
| **4 - Show Demo Proof.sh** | Displays live counts from the sample environment. |
| **5 - Demo Status.sh** | Shows which parts are running. |
| **6 - Stop Privacy Demo.sh** | Stops everything safely and keeps the sample data. |
| **9 - Reset Demo to Fresh State.sh** | Deletes and rebuilds the sample data. Do not use this during an evaluation. |

The word “Demo” appears in some launcher names because these controls operate the fictional evaluation environment. It is not part of the deployed product.

## Start in four simple steps

1. Double-click **1 - Start Privacy Demo.sh**.
2. If Linux asks what to do, choose **Run in Terminal** or **Execute**. Do not choose “Display”.
3. Wait until the black window says the platform is ready. Your browser should open automatically at `http://localhost:5173`.
4. Double-click **2 - Client Guide.sh** and follow it from the top.

The guide uses the same numbered controls you see in the main folder. Whenever it says to use a numbered Desktop button, use the matching numbered `.sh` file here.

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

## If double-click opens the file as text

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

1. Double-click **6 - Stop Privacy Demo.sh**.
2. Wait for **Everything is stopped**.
3. Press Enter and close the browser.

Stopping keeps the sample state. The next time you use button 1, the same requests, consents and incident will return.

## Quick help

| Problem | What to do |
|---|---|
| Browser did not open | Open `http://localhost:5173` yourself. |
| Page does not load | Wait 20 seconds and refresh once. |
| Still not working | Run **5 - Demo Status.sh**, then run button 6 followed by button 1. |
| Login is refused | Check the address: staff use `/login`; individuals use `/me/login`. Include the `!` in the password. |
| Database browser does not open | Start the environment with button 1 first. |
| A numbered file opens as text | Follow **If double-click opens the file as text** above. |
| Button 0 says a required program is missing | Ask the computer administrator to install the program named in the window, then run button 0 again. |
| You want a clean sample | Ask the environment owner before using button 9; rebuilding takes about 12 minutes. |

## Share the guides as single files

Both shareable guides contain their screenshots inside the HTML, so no image folder is required:

- [Standalone client guide](docs/demo-runbook/CLIENT-GUIDE-standalone.html)
- [Standalone presenter runbook](docs/demo-runbook/RUNBOOK-standalone.html)

The editable source files and image folder remain in `docs/demo-runbook/`.
