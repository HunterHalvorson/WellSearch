
"""Chroma store for the failure records. ingest.py fills it with add(); main.py reads it with search()."""

from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

import chromadb
import numpy as np
import pandas as pd
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

# The folder holds text from the dataset, so it is in .gitignore.
DB_PATH = Path(__file__).parent / "chroma_db"
COLLECTION = "failures"
BATCH = 500


@lru_cache(maxsize=1)
def _client():
    return chromadb.PersistentClient(path=str(DB_PATH))


def _collection():
    return _client().get_or_create_collection(
        COLLECTION,
        configuration={"hnsw": {"space": "cosine", "ef_search": 300}}
    )


@lru_cache(maxsize=1)
def _query_embedder():
    embedder = ONNXMiniLM_L6_V2()
    embedder.tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
    return embedder


def _clean(metadata):
    """Convert metadata into ChromaDB-compatible values."""
    out = {}

    for key, value in metadata.items():
        if not pd.api.types.is_scalar(value):
            value = str(value)
        elif pd.isna(value):
            continue
        elif isinstance(value, (datetime, date, np.datetime64)):
            value = pd.Timestamp(value).isoformat()
        elif isinstance(value, Decimal):
            value = float(value)
        elif isinstance(value, np.generic):
            value = value.item()

        out[str(key)] = value

    return out


def add(ids, documents, metadatas=None):
    """Insert or update failure records in ChromaDB."""

    ids = [str(i) for i in ids]

    if metadatas is None:
        metadatas = [{}] * len(ids)

    if not len(ids) == len(documents) == len(metadatas):
        raise ValueError(
            "ids, documents and metadatas must have the same length"
        )

    if len(set(ids)) != len(ids):
        raise ValueError("ids must be unique")

    rows = [
        (i, doc.strip(), _clean(meta) or None)
        for i, doc, meta in zip(ids, documents, metadatas)
        if isinstance(doc, str) and doc.strip()
    ]

    collection = _collection()

    step = min(BATCH, _client().get_max_batch_size())

    for start in range(0, len(rows), step):
        batch_ids, batch_docs, batch_meta = zip(
            *rows[start:start + step]
        )

        collection.upsert(
            ids=list(batch_ids),
            documents=list(batch_docs),
            metadatas=list(batch_meta)
        )

        print(
            f"stored {min(start + step, len(rows))}/{len(rows)}",
            flush=True
        )

    return len(rows)


def search(query, n=5, where=None):
    """Search similar failure records and return a pandas DataFrame."""

    if not isinstance(query, str) or not query.strip():
        raise ValueError("query is empty")

    found = _collection().query(
        query_embeddings=_query_embedder()([query]),
        n_results=n,
        where=where or None
    )

    results = [
        {
            "id": i,
            "text": doc,
            "similarity": round(1 - distance, 4),
            **(meta or {})
        }
        for i, doc, meta, distance in zip(
            found["ids"][0],
            found["documents"][0],
            found["metadatas"][0],
            found["distances"][0]
        )
    ]

    return pd.DataFrame(results)


def count():
    return _collection().count()


def reset():
    """Delete the collection."""
    try:
        _client().delete_collection(COLLECTION)
    except chromadb.errors.NotFoundError:
        pass
