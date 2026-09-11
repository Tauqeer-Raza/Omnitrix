from urllib.parse import urlparse

MODEL_BINDINGS = (
    ("fast-1", "FAST", "node-01", "Text primary", "text_base_url", "text_model"),
    ("fast-2", "FAST", "node-01", "Text fallback", "text_base_url", "text_fallback_model"),
    ("vision-1", "VISION", "node-02", "Vision primary", "vision_base_url", "vision_model"),
    (
        "vision-2",
        "VISION",
        "node-02",
        "Vision fallback",
        "vision_base_url",
        "vision_fallback_model",
    ),
    ("master-1", "MASTER", "node-03", "Code primary", "code_base_url", "code_model"),
    (
        "master-2",
        "MASTER",
        "node-03",
        "Code fallback",
        "code_base_url",
        "code_fallback_model",
    ),
    (
        "librarian-1",
        "LIBRARIAN",
        "control-plane",
        "Embedding primary",
        "embedding_base_url",
        "embedding_model",
    ),
    (
        "librarian-2",
        "LIBRARIAN",
        "control-plane",
        "Embedding alternative",
        "embedding_base_url",
        "embedding_model",
    ),
)


def endpoint_host(base_url: str) -> str:
    return urlparse(base_url).netloc if base_url else ""


def model_runtime(cfg, model_id: str) -> dict:
    for id, group, node_id, label, base_field, model_field in MODEL_BINDINGS:
        if id != model_id:
            continue
        base_url = getattr(cfg, base_field)
        served_model = getattr(cfg, model_field)
        if group == "LIBRARIAN" and id != cfg.embedding_registry_id:
            served_model = ""
        return {
            "id": id,
            "group": group,
            "nodeId": node_id,
            "label": label,
            "servedModel": served_model,
            "configured": bool(base_url and served_model),
            "endpointHost": endpoint_host(base_url),
        }
    raise KeyError(model_id)


def runtime_models(cfg) -> list[dict]:
    return [model_runtime(cfg, binding[0]) for binding in MODEL_BINDINGS]


def orchestrator_runtime(cfg) -> dict:
    return {
        "model": cfg.orchestrator_model,
        "nodeId": "control-plane",
        "configured": bool(cfg.orchestrator_base_url and cfg.orchestrator_model),
        "endpointHost": endpoint_host(cfg.orchestrator_base_url),
        "role": "Intent classification and workflow planning",
    }


def provider_targets(cfg) -> list[dict]:
    targets = [
        {
            "id": "orchestrator",
            "group": "ORCHESTRATOR",
            "nodeId": "control-plane",
            "baseUrl": cfg.orchestrator_base_url,
            "apiKey": cfg.orchestrator_api_key.get_secret_value(),
            "model": cfg.orchestrator_model,
        }
    ]
    keys = {
        "FAST": cfg.text_api_key.get_secret_value(),
        "VISION": cfg.vision_api_key.get_secret_value(),
        "MASTER": cfg.code_api_key.get_secret_value(),
        "LIBRARIAN": cfg.embedding_api_key.get_secret_value(),
    }
    bases = {
        "FAST": cfg.text_base_url,
        "VISION": cfg.vision_base_url,
        "MASTER": cfg.code_base_url,
        "LIBRARIAN": cfg.embedding_base_url,
    }
    for model in runtime_models(cfg):
        targets.append(
            {
                "id": model["id"],
                "group": model["group"],
                "nodeId": model["nodeId"],
                "baseUrl": bases[model["group"]],
                "apiKey": keys[model["group"]],
                "model": model["servedModel"],
            }
        )
    return targets
