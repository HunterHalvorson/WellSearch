# WellSearch

A search tool for well failure history. Ask a question in plain words and get the answer from the failure log, the service jobs and daily production, without opening any of the three files.

Built for the DSMLC Chirality Research x Canary Labs Datathon 2026 (theme: optimization).

**Team:** Hunter Halvorson, Ibrahim, Abdalla Eldoumani

**Video:** (link)  
**Slides:** [WellSearch Presentation](https://docs.google.com/presentation/d/18gMYh0K0BjPr19C_dsX7zfEwPReeYNhYIMuXM58oz38/edit?usp=sharing)

## Research question

Does streamlining the retrieval and presentation of historical well failure data improve efficiency compared to manually searching through millions of records?

## Why we picked it

When a rod or a pump fails, the useful question is whether this has happened on a similar well before and what the crew did about it. The answer exists, but it is spread over three datasets: 2,873 failure records, 15,610 service jobs and about 5 million rows of daily production. Finding the matching cases by hand means filtering the failure log, looking up each well's production around the failure date, then reading crew notes in the job file one by one.

We wanted that lookup to take one question.

## What it does

- **Field map.** The home page draws every well that has a recorded failure and plays the failure record across it month by month. The dataset has no coordinates. A Western Canada well identifier is a survey address (subdivision, section, township, range, meridian), so each well is placed from its own id.
- **Charts from a question.** "Where are pump failures most common?", "Which operating areas have the most downtime?", "How are the wells in the Cactus Lake area doing?" Each returns a chart, and for area questions a map of the wells behind it. You can go from an area to a well to its failure history and last week of production.
- **Similar past failures.** Describe a failure ("rod parted after a torque increase") and get the five closest past cases with the recorded cause and the repair job the crew ran, plus a short written summary of what those cases have in common.
- **Saved views.** Any result can be starred and reopened later.

## What we found

- The failure log is far more concentrated than the field. Two operating areas, Cactus Lake (957) and Winter (829), hold 62% of the 2,873 recorded failures. The failures sit on 825 wells; the production data covers 2,905.
- Fatigue (1,225) and corrosion (789) account for 70% of recorded causes.
- Dates in the failure log run from December 2021 to October 2026, but 99.8% of the records are from May 2025 on. Any trend drawn across the whole range is really an 18-month picture.
- The cause field is free text. The same cause shows up under several spellings ("Sand" and "sand", three spellings of rod wear), which splits counts unless they are merged. The interface merges them.
- A similarity search over the failure records takes about 7.5 ms per question on a laptop.

On the research question itself: we did not time engineers doing the same lookups by hand, so we cannot put a number on time saved. What we can show is that the three-file lookup described above becomes a single question with the answer on screen within seconds.

## How it works

**Building the records.** `server/ingest.py` joins each failure to two things: the well's average oil, pump efficiency, RPM and rod torque over the 30 days before the failure, and the first repair job recorded after it, including the crew's note. Each failure becomes one short text record.

**Search.** The records are embedded with all-MiniLM-L6-v2, which runs locally, and stored in a ChromaDB collection. A question is embedded the same way and the five nearest records come back (`server/vector_store.py`).

**Summary.** `server/llm.py` passes the question and those five records to a language model through LangChain. The prompt allows only what the records say, treats the 30-day figures as averages and not as readings at the failure, and has the model say which part of the question the records do not answer. If the model call fails, the records are still returned.

**Charts.** `server/analytics.py` matches a question to one of four chart types by its wording and computes the numbers from the parquet files with pandas. No language model is involved in the charts.

**Map.** `client/src/components/survey.js` turns a well id into a position using the Dominion Land Survey grid: six-mile townships counted north from the 49th parallel, ranges counted west from a meridian, sections and subdivisions numbered in rows that snake from the south-east corner.

**Interface.** React with Vite. Recharts for the charts, a canvas for the map.

## How we checked it

- Tests for the record store and the answer layer (`pytest` in `server/`). The answer tests use a stand-in model, so they run without an API key.
- We ran the search on the real data and read the results against the source rows.
- Reading the first model answers against the records caught a real problem: the model described a 30-day average as "torque at failure". We rewrote the prompt rules until two different questions came back with nothing the records did not support.
- The survey form of each well id that we decode for the map matches the formatted id in the dataset for all 825 wells with failures.

## Limits

- Similarity search returns the closest cases, not exact matches, and the summary only covers the five it was given.
- The embedding model reads about 256 tokens per record. Around a third of the records are longer than that, so the end of a long crew note does not count toward the match.
- On the last day in the production data, the Cactus Lake wells have no oil recorded, so the area status view shows none of them as producing. That is what the data says for that day, not a statement about the field.
- The written summary uses a hosted model (Groq), so the five matching records leave the machine for that one request. Search and charts run locally.

## Running it

The dataset is not in this repository. Put `daily_production.parquet`, `production_failures.parquet` and `well_jobs.parquet` in `server/data/`, and a copy in `Data/` at the top of the repository (the charts read from there).

```bash
cd server
python -m venv .venv
source .venv/Scripts/activate      # on macOS or Linux: source .venv/bin/activate
pip install -r requirements.txt
python ingest.py                   # builds the search index once
export GROQ_API_KEY=your-key       # only needed for the written summary
uvicorn main:app --port 8000
```

```bash
cd client
npm install
npm run dev                        # http://localhost:5173
```

## What we used

FastAPI, pandas and PyArrow, ChromaDB with the all-MiniLM-L6-v2 embedding model, LangChain, `openai/gpt-oss-120b` served by Groq, React, Vite, React Router, Recharts, Lucide icons, and the Unbounded, Onest and Martian Mono typefaces (SIL Open Font License).

## AI use

We used AI assistants throughout development and want to be transparent about their involvement.

- **Hunter** used ChatGPT for data exploration, architecture planning, backend development and debugging. Assistance included reading Parquet datasets, joining production, failure and maintenance records, calculating 30-day production statistics, and generating searchable failure records. ChatGPT also helped explain and implement ChromaDB similarity search, embeddings, FastAPI endpoints, and React–backend communication. Additional support included troubleshooting Python dependencies, Git conflicts, HTTP errors, JSON serialization, and file paths; exploring machine learning alternatives; refining the research question; and researching and formatting supporting references.

- **Ibrahim** used ChatGPT while building the chart logic and the first React screens.

- **Abdalla** used Claude for the search index and its speed, the LangChain answer layer and its tests, the interface redesign including the map, and a first draft of this README.

Much of the code was written with these tools. What was ours: the problem and the research question, what goes into each failure record, which chart questions to support, and checking the output. We ran the code on the real data, read the results against the source rows, and changed what was wrong. That is how the prompt problem above was found.

AI is also part of the product. The written summary is produced by a language model from records the search found, under the rules described above.
