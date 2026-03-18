# H000022 Passive Lottery

HTML/browser preview of the Passive Lottery task built with `psyflow-web`.
Condition cue -> fixation -> lottery reveal -> outcome feedback -> ITI flow, preplanned outcome sampling, and cumulative score logic are aligned to local `T000022-passive-lottery`, with shorter trial counts for preview.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/run_trial.ts`: trial logic
- `src/utils.ts`: lottery condition generation, score tracker, and summary helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000022-passive-lottery
```
