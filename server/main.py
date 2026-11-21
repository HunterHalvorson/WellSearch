from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from vector_store import search


class Search(BaseModel):
    query: str
    

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

import pandas as pd

@app.post("/search")
def query_search(request: Search):
    df = search(request.query)

    df = df.astype(object).where(pd.notna(df), None)

    return df.to_dict(orient="records")
