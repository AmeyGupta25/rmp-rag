import sys
import types
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# Stub the vector store so importing the API doesn't connect to Pinecone.
fake_vs = types.ModuleType("data.vectorstore")
fake_vs.query = MagicMock(return_value=["Professor: Brian Shotwell\nStudent Review: hard but fair"])
sys.modules["data.vectorstore"] = fake_vs

import api.main as main  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def reset():
    fake_vs.query.side_effect = None
    main.groq_client = MagicMock()
    yield


def test_ask_returns_answer_and_uses_configured_model():
    msg = MagicMock(content="Brian Shotwell is hard but fair.")
    main.groq_client.chat.completions.create.return_value = MagicMock(choices=[MagicMock(message=msg)])
    r = client.post("/ask", json={"question": "Who teaches physics?"})
    assert r.status_code == 200
    assert r.json()["answer"] == "Brian Shotwell is hard but fair."
    assert main.groq_client.chat.completions.create.call_args.kwargs["model"] == main.GROQ_MODEL


def test_upstream_failure_is_502_without_leaking_details():
    fake_vs.query.side_effect = RuntimeError("quota exceeded for index rmp-rag")
    r = client.post("/ask", json={"question": "anything"})
    assert r.status_code == 502
    assert "quota" not in r.text and "rmp-rag" not in r.text


def test_professor_names_with_no_break_spaces_are_matched():
    found = main.extract_professors("Take Prof. Brian Shotwell or Brian Shotwell.")
    assert [p["name"] for p in found] == ["Brian Shotwell"]


def test_empty_model_answer_is_502_not_crash():
    msg = MagicMock(content=None)
    main.groq_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=msg, finish_reason="length")]
    )
    r = client.post("/ask", json={"question": "anything"})
    assert r.status_code == 502
