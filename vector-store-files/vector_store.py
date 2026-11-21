"""Chroma store for the failure records. ingest.py fills it with add(); main.py reads it with search()."""

from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

import chromadb
import numpy as np
import pandas as pd

# The folder holds text from the dataset, so it is in .gitignore.
DB_PATH = Path(__file__).parent / "chroma_db"
COLLECTION = "failures"
BATCH = 500


@lru_cache(maxsize=1)
def _client():
    return chromadb.PersistentClient(path=str(DB_PATH))


def _collection():
    # Chroma defaults to squared L2; cosine is the usual choice for text embeddings.
    return _client().get_or_create_collection(
        COLLECTION, configuration={"hnsw": {"space": "cosine"}}
    )


def _clean(metadata):
    """Chroma takes str, int, float and bool only. A pandas row also carries NaN, NaT, Timestamp and Decimal."""
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
    """Store rows, overwriting any row that already has the same id. Returns how many were stored.

    Rows whose document is empty are skipped, because there is nothing to embed.
    """
    ids = [str(i) for i in ids]
    if metadatas is None:
        metadatas = [{}] * len(ids)
    if not len(ids) == len(documents) == len(metadatas):
        raise ValueError("ids, documents and metadatas must have the same length")
    if len(set(ids)) != len(ids):
        # upsert would keep only the last row of each duplicate, and the count would be short with no error
        raise ValueError("ids must be unique")

    rows = [
        (i, doc.strip(), _clean(meta) or None)  # Chroma rejects an empty dict
        for i, doc, meta in zip(ids, documents, metadatas)
        if isinstance(doc, str) and doc.strip()
    ]
    collection = _collection()
    # Embedding runs on the CPU and the full set takes minutes, so work in small batches and show progress.
    step = min(BATCH, _client().get_max_batch_size())
    for start in range(0, len(rows), step):
        batch_ids, batch_docs, batch_meta = zip(*rows[start : start + step])
        collection.upsert(ids=list(batch_ids), documents=list(batch_docs), metadatas=list(batch_meta))
        print(f"stored {min(start + step, len(rows))}/{len(rows)}", flush=True)
    return len(rows)


def search(query, n=5, where=None):
    """The n records closest in meaning to query, best first.

    where is a Chroma metadata filter, for example {"cause": "Fatigue"}.
    Each result is {"id", "text", "similarity", "metadata"}; similarity is 1 for an identical record.
    """
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query is empty")
    found = _collection().query(query_texts=[query], n_results=n, where=where or None)
    return [
        {"id": i, "text": doc, "similarity": round(1 - distance, 4), "metadata": meta or {}}
        for i, doc, meta, distance in zip(
            found["ids"][0], found["documents"][0], found["metadatas"][0], found["distances"][0]
        )
    ]


def count():
    return _collection().count()


def reset():
    """Empty the store. Run before a re-ingest that changes the ids, or the old rows stay."""
    try:
        _client().delete_collection(COLLECTION)
    except chromadb.errors.NotFoundError:
        pass
