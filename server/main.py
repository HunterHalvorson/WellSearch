import llm
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


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


@app.post("/search")
def query_search(request: Search):
    """The five closest failure records and a summary written from them: {"answer", "results"}."""
    try:
        return llm.ask(request.query)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
