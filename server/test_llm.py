"""Run from server/ with: python -m pytest test_llm.py. No API key needed: the model is replaced by a fake."""

import json

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

import llm
import vector_store


class Recorder(FakeListChatModel):
    """Answers with a fixed sentence and keeps the prompt it was sent."""

    seen: list = []

    def _call(self, messages, *args, **kwargs):
        self.seen.append("\n".join(message.content for message in messages))
        return super()._call(messages, *args, **kwargs)


@pytest.fixture
def model(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, "DB_PATH", tmp_path)
    vector_store._client.cache_clear()
    fake = Recorder(responses=["Well A1 broke a rod from fatigue."], seen=[])
    monkeypatch.setattr(llm, "_model", lambda: fake)
    yield fake
    vector_store._client.cache_clear()


def load():
    vector_store.add(
        ["failure_0", "failure_1"],
        [
            "\n        Well A1 experienced a Rods\n        caused by Fatigue. Welder fused the corod.\n    ",
            "Well B2 experienced a Pump failure caused by Sand. " + "Flushed tubing. " * 300,
        ],
        [{"uwi": "A1", "cause": "Fatigue", "avg_30d_pcp_pump_rpm": 210.5}, {"uwi": "B2", "cause": "Sand"}],
    )


def test_answer_is_written_from_the_records_search_found(model):
    load()
    reply = llm.ask("rod parted from fatigue")
    assert reply["answer"] == "Well A1 broke a rod from fatigue."
    assert [r["id"] for r in reply["results"]] == ["failure_0", "failure_1"]
    prompt = model.seen[0]
    assert "Question: rod parted from fatigue" in prompt
    assert "[1] Well A1 experienced a Rods caused by Fatigue. Welder fused the corod." in prompt
    assert "[2] Well B2" in prompt
    assert len(prompt) < 2 * llm.RECORD_CHARS + 1500  # the long note was cut


def test_reply_is_valid_json_when_a_record_lacks_a_field(model):
    load()
    reply = llm.ask("pump sanded in")
    assert next(r for r in reply["results"] if r["id"] == "failure_1")["avg_30d_pcp_pump_rpm"] is None
    json.dumps(reply, allow_nan=False)


def test_results_still_come_back_when_the_model_fails(model, monkeypatch, capsys):
    load()

    def no_key():
        raise RuntimeError("GROQ_API_KEY is not set")

    monkeypatch.setattr(llm, "_model", no_key)
    reply = llm.ask("rod parted")
    assert reply["answer"] is None
    assert len(reply["results"]) == 2
    assert "GROQ_API_KEY is not set" in capsys.readouterr().out


def test_empty_store_does_not_call_the_model(model):
    assert llm.ask("rod parted") == {"answer": None, "results": []}
    assert model.seen == []


def test_blank_question_is_refused(model):
    with pytest.raises(ValueError, match="empty"):
        llm.ask("  ")
