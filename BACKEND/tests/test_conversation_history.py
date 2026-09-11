import json

import pytest
from conftest import create_operator, drain, login
from test_api import task

from app.domain import APIError


def finish(client, app, created):
    drain(client, app)
    return client.get(f"/api/v1/tasks/{created['id']}").json()


def sent_context(calls):
    routing = next(body for host, _, body in calls if host == "orchestrator.local")
    generation = next(body for host, _, body in calls if host == "text.local")
    return json.loads(routing["messages"][-1]["content"].split("\nINPUT:\n", 1)[-1]), generation[
        "messages"
    ]


@pytest.mark.parametrize("failure", ["invalid_plan", "partial", "cancelled"])
@pytest.mark.parametrize("has_successful_history", [False, True])
def test_failed_turn_is_visible_but_excluded_from_both_models(
    environment, monkeypatch, failure, has_successful_history
):
    client, app, _, calls = environment
    login(client)
    previous = None
    if has_successful_history:
        previous = finish(client, app, task(client, "Explain computer storage").json())
        assert previous["status"] == "completed"
    failed = task(
        client, "who is jeff bezoz", conversation=previous["conversationId"] if previous else None
    ).json()

    async def invalid(*args, **kwargs):
        return '{"type":"unsupported"}', (20, False)

    async def interrupted(*args, **kwargs):
        yield "delta", "INCOMPLETE_BIOGRAPHY"
        raise APIError("INFERENCE_INTERRUPTED", "Connection ended", 503)

    with monkeypatch.context() as patch:
        if failure == "cancelled":
            assert client.post(f"/api/v1/tasks/{failed['id']}/cancel").status_code == 204
        elif failure == "invalid_plan":
            patch.setattr(app.state.providers, "chat", invalid)
        else:
            patch.setattr(app.state.providers, "stream_chat", interrupted)
        failed = finish(client, app, failed)
    assert failed["status"] == "failed"
    assert failed["reply"] == ("INCOMPLETE_BIOGRAPHY" if failure == "partial" else "")

    calls.clear()
    next_turn = finish(
        client,
        app,
        task(
            client, "What is memory distribution in Computer", conversation=failed["conversationId"]
        ).json(),
    )
    assert next_turn["status"] == "completed", next_turn.get("error")
    routing, messages = sent_context(calls)
    assert routing["previous_prompt"] == (previous["prompt"] if previous else None)
    assert routing["previous_type"] == ("general" if previous else None)
    # Check the request data, separately from the fixed classification examples.
    assert "who is jeff bezoz" not in json.dumps([routing, messages])
    assert "INCOMPLETE_BIOGRAPHY" not in json.dumps(calls)
    expected = (
        []
        if not previous
        else [
            {"role": "user", "content": previous["prompt"]},
            {"role": "assistant", "content": previous["reply"]},
        ]
    )
    assert messages[1:-1] == expected
    assert messages[-1] == {"role": "user", "content": next_turn["prompt"]}
    # Display/audit records survive the filtering of inference context.
    saved_failure = client.get(f"/api/v1/tasks/{failed['id']}").json()
    assert saved_failure["status"] == "failed" and saved_failure["error"] == failed["error"]


def test_retry_sends_failed_prompt_once_and_restores_successful_context(environment):
    client, app, _, calls = environment
    login(client)
    root = task(client, "Explain computer storage").json()
    assert client.post(f"/api/v1/tasks/{root['id']}/cancel").status_code == 204
    assert client.post(f"/api/v1/tasks/{root['id']}/retry").status_code == 204
    retried = finish(client, app, root)
    assert retried["status"] == "completed"
    routing, messages = sent_context(calls)
    assert routing["previous_prompt"] is None
    assert messages[1:] == [{"role": "user", "content": root["prompt"]}]
    calls.clear()
    followup = finish(
        client, app, task(client, "Make that shorter", conversation=root["id"]).json()
    )
    assert followup["status"] == "completed"
    routing, messages = sent_context(calls)
    assert routing["previous_prompt"] == root["prompt"]
    assert messages[1:3] == [
        {"role": "user", "content": root["prompt"]},
        {"role": "assistant", "content": retried["reply"]},
    ]


def test_new_chats_and_other_users_do_not_contribute_history(environment):
    client, app, _, calls = environment
    login(client)
    operator = create_operator(client)
    first = finish(client, app, task(client, "ALPHA conversation").json())
    calls.clear()
    second = finish(client, app, task(client, "BETA conversation").json())
    routing, messages = sent_context(calls)
    assert first["conversationId"] == first["id"]
    assert second["conversationId"] == second["id"] != first["id"]
    assert routing["previous_prompt"] is None and len(messages) == 2
    login(client, operator["email"])
    assert task(client, "Read their history", conversation=first["id"]).status_code == 404
    calls.clear()
    third = finish(client, app, task(client, "GAMMA conversation").json())
    assert third["status"] == "completed"
    routing, messages = sent_context(calls)
    assert routing["previous_prompt"] is None and len(messages) == 2
    login(client)
    calls.clear()
    followup = finish(
        client, app, task(client, "Explain that further", conversation=first["id"]).json()
    )
    assert followup["status"] == "completed"
    routing, messages = sent_context(calls)
    assert routing["previous_prompt"] == first["prompt"]
    assert messages[1:-1] == [
        {"role": "user", "content": first["prompt"]},
        {"role": "assistant", "content": first["reply"]},
    ]
    assert "BETA conversation" not in json.dumps(calls)
    assert "GAMMA conversation" not in json.dumps(calls)


@pytest.mark.parametrize("no_history", [False, True])
def test_context_budget_keeps_whole_turns_for_both_models(environment, no_history):
    client, app, cfg, calls = environment
    login(client)
    root = finish(client, app, task(client, "First topic").json())
    second = finish(client, app, task(client, "Second topic", conversation=root["id"]).json())
    # The old per-message trimming leaves the first assistant reply without its user prompt.
    cfg.max_history_chars = (
        0 if no_history else len(root["reply"]) + len(second["prompt"]) + len(second["reply"])
    )
    calls.clear()
    result = finish(client, app, task(client, "Make that shorter", conversation=root["id"]).json())
    assert result["status"] == "completed"
    routing, messages = sent_context(calls)
    expected = (
        []
        if no_history
        else [
            {"role": "user", "content": second["prompt"]},
            {"role": "assistant", "content": second["reply"]},
        ]
    )
    assert messages[1:-1] == expected
    assert routing["previous_prompt"] == (None if no_history else second["prompt"])
