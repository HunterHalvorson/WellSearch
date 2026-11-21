"""Run from server/ with: python -m pytest test_vector_store.py"""

from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

import vector_store


@pytest.fixture(autouse=True)
def temp_store(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, "DB_PATH", tmp_path)
    vector_store._client.cache_clear()
    yield
    vector_store._client.cache_clear()


NOTES = pd.DataFrame(
    {
        "id": ["j1", "j2", "j3", "j4"],
        "text": [
            "Broken corod at 505 m. Welder fused the rod, ran it back in hole, respaced.",
            "Pump sanded and torqued up. Pulled rotor, flushed tubing, new stator.",
            "Hole in tubing at joint 41. Replaced 6 joints and pressure tested.",
            None,
        ],
        "field_operating_area": ["Winter", "Cactus Lake", "Winter", "Winter"],
        "start_date": pd.to_datetime(["2024-03-05", "2025-01-10", None, "2025-02-01"]),
        "cost": [Decimal("6031.50"), np.float64(30773.0), float("nan"), 10.0],
        "objective": ["Rod repair", None, "Tubing repair", "x"],
    }
)


def load():
    meta = NOTES.drop(columns=["id", "text"]).to_dict("records")
    return vector_store.add(NOTES["id"], NOTES["text"], meta)


def test_add_skips_empty_notes_and_search_finds_the_right_one():
    assert load() == 3
    assert vector_store.count() == 3
    top = vector_store.search("rod string parted and was welded", n=2)
    assert [r["id"] for r in top][0] == "j1"
    assert top[0]["similarity"] > top[1]["similarity"]


def test_metadata_comes_back_as_plain_json_types():
    load()
    by_id = {r["id"]: r["metadata"] for r in vector_store.search("repair", n=3)}
    assert by_id["j1"] == {
        "field_operating_area": "Winter",
        "start_date": "2024-03-05T00:00:00",
        "cost": 6031.5,
        "objective": "Rod repair",
    }
    assert "objective" not in by_id["j2"]  # None dropped
    assert "start_date" not in by_id["j3"] and "cost" not in by_id["j3"]  # NaT and NaN dropped


def test_where_filters_on_metadata():
    load()
    hits = vector_store.search("pump or tubing work", n=5, where={"field_operating_area": "Winter"})
    assert {r["id"] for r in hits} == {"j1", "j3"}


def test_add_twice_overwrites_instead_of_duplicating():
    load()
    load()
    assert vector_store.count() == 3


def test_rows_without_metadata_and_more_rows_than_one_batch(monkeypatch):
    monkeypatch.setattr(type(vector_store._client()), "get_max_batch_size", lambda self: 2)
    collection_type = type(vector_store._collection())
    upsert, sizes = collection_type.upsert, []
    monkeypatch.setattr(
        collection_type, "upsert", lambda self, **kw: (sizes.append(len(kw["ids"])), upsert(self, **kw))[1]
    )
    assert vector_store.add(["a", "b", "c"], ["rod break", "pump change", "tubing leak"]) == 3
    assert sizes == [2, 1]
    assert vector_store.search("rod break", n=1)[0]["metadata"] == {}


def test_bad_input_is_refused():
    with pytest.raises(ValueError, match="unique"):
        vector_store.add(["a", "a"], ["x", "y"])
    with pytest.raises(ValueError, match="same length"):
        vector_store.add(["a", "b"], ["x"])
    with pytest.raises(ValueError, match="empty"):
        vector_store.search("   ")


def test_reset_empties_the_store_and_is_safe_to_repeat():
    load()
    vector_store.reset()
    vector_store.reset()
    assert vector_store.count() == 0
