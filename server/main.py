import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analytics import chart_search
from vector_store import search


class Search(BaseModel):
    query: str
    view: str | None = None

app = FastAPI()


origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"Hello": "World"}


@app.post("/search")
def query_search(request: Search):
    """Return chart data, a summary with matches, or the default list of matches."""
    try:
        if request.view == "chart":
            return chart_search(request.query, search)
        if request.view == "summary":
            import llm

            return llm.ask(request.query)
        df = search(request.query)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail="Search data is unavailable.") from error

    return df.astype(object).where(pd.notna(df), None).to_dict(orient="records")
