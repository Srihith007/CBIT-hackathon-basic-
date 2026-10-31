# TraceLine

AI-assisted reconstruction of road-accident evidence for the CBIT Hacktoberfest '26 hackathon. It combines video, witness statements and sensor records into a chronological timeline, identifies disagreements and gaps, and links conclusions to evidence. It supports an investigation; it does not assign fault.

## Fresh clone: Windows, macOS or Linux

Requirements: **Python 3.11+**, **Node.js/npm**, and **PostgreSQL 16+**. FFmpeg/ffprobe and detection models are needed for video processing, but **not for creating a case**.

Run all setup commands from the **repository root**, the folder containing this README. The backend reads `.env` from that root, even when started from `backend/`.

1. Copy `.env.example` to `.env`:

   ```sh
   cp .env.example .env
   ```

   In Windows PowerShell use `Copy-Item .env.example .env`.

2. Set `DATABASE_URL` in `.env` to your running PostgreSQL database. This project requires PostgreSQL; SQLite is not supported. A local database can optionally be started using Docker:

   - Set `POSTGRES_PASSWORD` and the password in `DATABASE_URL` to the **same value**. URL-encode special characters in the URL password.
   - The template uses user/database `traceline` and port `5432`.
   - Run `docker compose up -d --wait db`.
   - If you change `POSTGRES_PORT`, also change the port in `DATABASE_URL`.
   - If you already have PostgreSQL, create an empty database and use that database's credentials instead.

3. Install dependencies and apply **all database migrations**:

   ```sh
   python setup-local.py
   ```

   Use `python3` instead of `python` if that is your Python 3 command. Windows can use `py -3.11 setup-local.py`. Setup creates `backend/.venv`, installs backend/frontend dependencies and upgrades the schema. It preserves existing cases. To apply migrations without reinstalling dependencies: `python setup-local.py --skip-install`.

4. Run both servers:

   ```sh
   python run-local.py
   ```

   Open **http://127.0.0.1:5176/**. API documentation is at **http://127.0.0.1:8010/docs**. Keep this terminal open. Startup applies migrations before serving requests. On macOS/Linux, `bash run.sh` also starts both servers.

No external AI key is required to create cases or use local witness extraction. Credentials, installed dependencies, uploaded evidence and weights are intentionally excluded from Git; cloning does not copy another developer's local setup.

## Already cloned, but creating a case returns 500

Pull the newest code, then from the repository root run:

```sh
git pull
python setup-local.py --skip-install
python run-local.py
```

If dependencies have not been installed, omit `--skip-install`. Use a free pair of ports if another copy is running. PowerShell example:

```powershell
$env:TRACELINE_API_PORT="8012"
$env:TRACELINE_FRONTEND_PORT="5178"
python run-local.py
```

On macOS/Linux:

```sh
TRACELINE_API_PORT=8012 TRACELINE_FRONTEND_PORT=5178 python run-local.py
```

Check `http://127.0.0.1:8010/api/v1/health` (substitute your API port). `database.ok` must be `true`, and `migration` must match `required_migration` (currently `0010`). Missing FFmpeg can make overall health degraded while case creation still works. Old databases can be missing case incident/location columns or the actor-name migration; upgrade them instead of deleting them.

If it still fails, capture the **response body of `POST /api/v1/cases`** and the backend terminal error. Do not share `.env` or passwords.

## Video processing and demo data

Install FFmpeg and ffprobe on your OS and put them on PATH. In `backend/`, use the virtual environment to install `requirements-vision.txt` and run `scripts/fetch_models.py` for pinned weights. The vision requirements use CPU wheels; macOS needs its platform's torch/torchvision wheels rather than Linux `+cpu` builds. These are separate from case creation.

Optional synthetic scenarios can be generated with `scripts/build_scenarios.py`. See [the evidence workflow](docs/evidence-workflow.md) for witness review, vehicle matching, clock alignment and reconstruction updates. Tests require a **separate** PostgreSQL database in `TEST_DATABASE_URL`; the suite refuses to reset the development database.

## Project structure and limits

`backend/`: FastAPI/PostgreSQL pipeline and rules. `frontend/`: React workspace. `docs/`: architecture and workflows. `research/`: measured results. `data/`: local evidence and weights, excluded from Git.

Integration tests verify the workflow on controlled inputs. Accuracy on arbitrary real accident footage and complex witness language is not established by those tests. See `docs/RISKS_AND_LIMITATIONS.md`.
