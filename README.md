# HackSwarm agent team

Run this on your own laptop. Open it in a browser on that laptop and on your phone. Tailscale connects your phone to your laptop. It does not connect you to anyone else's computer. Your API keys stay in a local `.env` file. Your Python install stays in a local `.venv` folder. Git does not upload either one.

Follow the steps in order. Each step is required unless it says optional.

## 1. Install the programs

The repository does not contain these. Install them on the laptop before cloning.

1. [Git for Windows](https://git-scm.com/download/win). Aider uses Git to edit a project. Check with `git --version`.
2. [Python 3.12 for Windows](https://www.python.org/downloads/windows/). Aider does not install on Python 3.13, so this project uses a 3.12 virtual environment. Turn on "Add python.exe to PATH" in the installer, or run `winget install --id Python.Python.3.12 -e`. Open a new PowerShell window and check with `py -3.12 --version`. The reply must start with `Python 3.12`.
3. [Node.js 20 LTS](https://nodejs.org/) or newer. The phone page is a Next.js app. Or run `winget install --id OpenJS.NodeJS.LTS -e`. Check with `node -v` and `npm -v`.
4. [Tailscale](https://tailscale.com/download) on the laptop and on the phone, both signed into your Tailscale account. That is the private path from the phone browser to this laptop.

Ollama is optional. Skip it if you will use a Gemini key. For a model that stays on the laptop, install [Ollama](https://ollama.com/download) now. The model download is in step 4.

## 2. Clone the repository

```powershell
git clone https://github.com/AbisoyeOnanuga/agent-team.git
cd agent-team
```

## 3. Create your private `.env`

```powershell
copy .env.example .env
```

Open `.env` in an editor and set your own values:

- `CONSOLE_PIN` is the password you will type on the phone. Replace `change-me`.
- For Gemini, create a key in [Google AI Studio](https://aistudio.google.com/app/apikey), put it in `GEMINI_API_KEY`, and leave `HACKSWARM_PROVIDER=gemini`.
- For a local model, set `HACKSWARM_PROVIDER=ollama` and leave the Gemini key unused.
- `HACKSWARM_REPO_ROOTS` is a folder on your disk that the worker may edit, for example `C:\Users\YourName\Projects`. `D:\Documents\vscode` in the example is only one machine's path.

Leave `HACKSWARM_WORKER=1`. The hub starts the worker when that is set. `.env` is listed in `.gitignore`. Do not force-add it.

## 4. Create the virtual environment

This step is required. The author uses a `.venv` on their laptop, and you need your own. Git does not include it. `pip` downloads the packages from PyPI onto your machine. The first run can take several minutes and creates a folder of about 600 MB.

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

`requirements.txt` includes `aider-chat==0.86.2` and the hub packages. If `py -3.12` is not recognized, go back to step 1 and open a new PowerShell window after Python 3.12 is installed. Do not copy a `.venv` folder from another computer.

On macOS or Linux, use `python3.12 -m venv .venv` and `.venv/bin/python -m pip install -r requirements.txt`.

If you chose Ollama in step 3, pull the model now, from [Ollama's library](https://ollama.com/library/gemma3):

```powershell
ollama pull gemma3:4b
```

## 5. Install the mobile app page

`npm install` downloads Next.js into `apps/console/node_modules`. That folder is gitignored too.

```powershell
cd apps\console
npm install
cd ..\..
```

## 6. Start the hub

Leave this window open. The worker starts inside this process.

The `.venv` folder is Python 3.12 and is where Aider runs. The hub uses that same interpreter only after `requirements.txt` is installed into it. The module name is `central_hub`, with an A.

```powershell
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn central_hub.api.app:app --host 127.0.0.1 --port 8797
```

The hub listens only on the laptop, at `http://127.0.0.1:8797`. Do not port-forward this port.

## 7. Start the phone page

Open a second PowerShell window in the same `agent-team` folder. Leave it open.

```powershell
cd apps\console
npm run dev
```

This listens on port 3000. Do not port-forward that port on your router. Tailscale is how the phone reaches it.

## 8. Open it on the laptop

In a browser on the laptop, open [http://127.0.0.1:3000](http://127.0.0.1:3000). Sign in with the `CONSOLE_PIN` from your `.env`. Eight wrong attempts lock the console for 15 minutes.

## 9. Open it on your phone

Tailscale must be connected on the phone and on the laptop, on your account. On the laptop:

```powershell
tailscale ip -4
```

On the phone's browser, open `http://<that-address>:3000`. If the command prints `100.64.12.34`, the phone opens `http://100.64.12.34:3000`. That address is your laptop. Sign in with the same PIN.

## 10. Point each role at a project

The bottom bar is Board, Log, Approve, Notes, and Access.

1. Open Access.
2. Choose Gemini or the local Ollama model. Gemini needs the key from step 3. Ollama needs `gemma3:4b` from step 4.
3. Set a folder for each role, then save. For Trail Sketch, UI is `D:\Documents\vscode\trail-sketch\src`, API is `D:\Documents\vscode\trail-sketch\server`, and Review is whichever of those two was just edited. The project root makes every role look through the whole tree. The model only receives the locked files inside the folder you saved.
4. Routine mode waits before a commit, a delete, or an install. Open mode lets a commit land without waiting. Push never runs from the phone.

## 11. Send a task

1. Open Board.
2. Fill in Title and What should change.
3. Choose the agent (UI, API, or Review). These are three queues, not three models. They share the model you picked in Access.
4. Press Queue it.
5. One task runs at a time. The next role waits until the current task is closed.
6. The card lamp shows Idle, Editing, Waiting, or Dry-run. Dry-run means no model is configured. Add the Gemini key or switch to Ollama.
7. Open Log to watch the work. Open Approve when a lamp says Waiting.

A task sent from the phone writes `.hackswarm/notes.md` in the project folder you saved. Put the change you want in What should change. Optional standing rules go in `HACKSWARM.md` in that project. The worker reads the first 4000 characters of that file on every task.

## What the clone does not include

| On the author's machine only | What you do |
| --- | --- |
| `.venv/` | Step 4 |
| `apps/console/node_modules/` | Step 5 |
| `.env` | Step 3 |
| `*.db` task queue | Created the first time the hub starts |
| `.aider*` chat log and repo-map cache | Aider creates these locally when it edits |
| Ollama models | Step 4, only if you chose Ollama |

`git pull` updates the source on your laptop. Restart the two windows from steps 6 and 7 to see it on the desktop and the phone. A pull does not replace your `.env` or your `.venv`.

The picture in `central_hub/dashboard/visualizer.html` is a desk simulation. It is not the live console.

## Models you can switch on

- No key: the queues, the log, and approval still work. Edits stay a dry-run.
- Gemini: `HACKSWARM_PROVIDER=gemini` and your `GEMINI_API_KEY`. The editor model is `gemini-3.8-flash`.
- Ollama on this laptop: `HACKSWARM_PROVIDER=ollama` and `gemma3:4b`. Slower than Gemini. Expect tens of seconds for an edit.
- xAI, only if you want Grok outside Cursor: a key from [console.x.ai](https://console.x.ai/), `XAI_API_KEY`, and `HACKSWARM_PROVIDER=grok`. Cursor's Grok subscription is not a key for this app.

Mistral, OpenRouter, NVIDIA NIM, OpenCode, Copilot, and Groq are not part of this phone console.

OpenHands, OpenCode, and the extra free-API accounts from the original fork are not started by this console. Steps 1 through 11 are the whole path.
