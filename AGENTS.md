# Repository Guidelines

## Project Structure & Module Organization

This repository is intentionally small at the moment.

- `main.py`: current top-level Python entry point.
- `src/`: Python package area for application modules. Add new code here instead of growing `main.py`.
- `.github/workflows/`: GitHub Actions workflows, including deployment automation.
- `README.md`: short project overview.

Keep feature code in `src/` and reserve repository-root files for entry points, config, and docs.

## Build, Test, and Development Commands

For dependency management, building, and running, use [uv](https://github.com/astral-sh/uv)—a fast Python package manager.

Example development workflow:

- `uv venv` — create a virtual environment
- `uv pip install -r requirements.txt` — install dependencies
- `uv pip list` — view installed packages

Running the app:

- `uv pip install .` (if using a package `pyproject.toml`)
- `uv run main.py`: run the entry point (or `py main.py` on Windows)
- `uv run -m src`: preferred once `src` becomes a module

Other helpful commands:

- `git status`: verify only intended changes are staged.
- `gh run list --repo Doomsy1/carboard`: inspect deployment workflow runs.

If you add tooling such as `pytest`, `ruff`, or update/add `pyproject.toml`, revise this guide in the same change.

## Coding Style & Naming Conventions

Use Python 3 with 4-space indentation and UTF-8 text files. Prefer:

- `snake_case` for modules, functions, and variables
- `PascalCase` for classes
- small, single-purpose modules under `src/`

Keep root scripts thin and move reusable logic into `src/`. Use descriptive names such as `src/deploy_client.py`, not `src/utils2.py`.

## Testing Guidelines

No test suite is committed yet. When adding behavior, add tests alongside it.

- Put tests under `tests/`
- Name files `test_<feature>.py`
- Run with `uv pip install pytest` and then `uv run -m pytest -q`

Prefer behavior-focused tests over implementation-heavy mocks.

## Commit & Pull Request Guidelines

Recent commits use short, imperative subjects such as `Add README.md` and `Use self-hosted deploy runner`. Follow that pattern.

- Keep commit titles concise and action-oriented
- Group related code, docs, and workflow updates in one change
- In PRs, include purpose, impact, and any deployment implications

## Security & Configuration Tips

Do not commit secrets. `ssh.info` contains sensitive connection data and should remain local-only. The deployment workflow runs on a self-hosted runner, so review `.github/workflows/deploy-on-push.yml` carefully before changing deploy behavior.
