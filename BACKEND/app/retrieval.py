import asyncio
import math
import re
import uuid

from sqlalchemy import select

from .db import Chunk, Document, Record
from .domain import APIError, permitted


class Retrieval:
    def __init__(self, cfg, db, providers):
        self.cfg, self.db, self.providers = cfg, db, providers
        self.lock = asyncio.Lock()

    def embedding_access(self, user):
        if "LIBRARIAN" not in user.data["modelAccess"]:
            raise APIError("FORBIDDEN", "Your account cannot use the local embedding service.", 403)
        with self.db.read() as s:
            rule = s.get(Record, ("routing", "route-librarian"))
            model = s.get(Record, ("models", self.cfg.embedding_registry_id))
            node = s.get(Record, ("nodes", "control-plane"))
            if not rule or rule.data["primaryId"] != self.cfg.embedding_registry_id:
                raise APIError(
                    "EMBEDDING_CONFIGURATION",
                    "The librarian routing primary must match EMBEDDING_REGISTRY_ID. Changing embedding models also requires reindexing.",
                    503,
                )
            if (
                not model
                or not model.data["enabled"]
                or not node
                or node.data["status"] != "online"
            ):
                raise APIError(
                    "MODEL_UNAVAILABLE",
                    "The configured librarian or control-plane node is disabled.",
                    503,
                )

    async def qrequest(self, method, suffix, body=None):
        if not self.cfg.qdrant_url:
            raise APIError("SERVICE_NOT_CONFIGURED", "QDRANT_URL is not configured.", 503)
        return await self.providers.request(
            method,
            self.cfg.qdrant_url.rstrip("/") + suffix,
            body=body,
            headers={"api-key": self.cfg.qdrant_api_key.get_secret_value()},
        )

    async def ensure_collection(self):
        async with self.lock:
            listing = await self.qrequest("GET", "/collections")
            if self.cfg.qdrant_collection not in [
                c["name"] for c in listing["result"]["collections"]
            ]:
                await self.qrequest(
                    "PUT",
                    f"/collections/{self.cfg.qdrant_collection}",
                    {"vectors": {"size": self.cfg.embedding_dimensions, "distance": "Cosine"}},
                )
            info = await self.qrequest("GET", f"/collections/{self.cfg.qdrant_collection}")
            vectors = info["result"]["config"]["params"]["vectors"]
            if (
                vectors.get("size") != self.cfg.embedding_dimensions
                or vectors.get("distance") != "Cosine"
            ):
                raise APIError(
                    "VECTOR_CONFIGURATION",
                    "Qdrant collection dimensions/distance do not match configuration.",
                    503,
                )

    async def index(self, chunks, vectors):
        if self.cfg.vector_store != "qdrant":
            return
        await self.ensure_collection()
        await self.qrequest(
            "PUT",
            f"/collections/{self.cfg.qdrant_collection}/points?wait=true",
            {
                "points": [
                    {
                        "id": str(uuid.UUID(c.id.removeprefix("chunk-"))),
                        "vector": vector,
                        "payload": {
                            "chunk_id": c.id,
                            "document_id": c.document_id,
                            "embedding_model": self.cfg.embedding_model,
                        },
                    }
                    for c, vector in zip(chunks, vectors, strict=True)
                ]
            },
        )

    async def remove(self, document_id):
        if self.cfg.vector_store == "qdrant":
            await self.qrequest(
                "POST",
                f"/collections/{self.cfg.qdrant_collection}/points/delete?wait=true",
                {"filter": {"must": [{"key": "document_id", "match": {"value": document_id}}]}},
            )

    def documents_for(self, session, user, document_ids=None, knowledge=True):
        allowed = []
        for doc in session.scalars(select(Document)):
            own = doc.owner_id == user.id or user.data["role"] == "admin"
            explicit = doc.id in (document_ids or []) and own
            shared = knowledge and doc.data["knowledge"] and "knowledge" in user.data["permissions"]
            if (explicit or shared) and doc.data["status"] == "indexed":
                allowed.append(doc)
        return allowed

    async def search(self, query, user, *, document_ids=None, knowledge=True, charge=None):
        if knowledge:
            permitted(user, "knowledge")
        with self.db.read() as s:
            docs = self.documents_for(s, user, document_ids, knowledge)
            if not docs:
                return []
            doc_map = {d.id: d for d in docs}
            chunks = []
            if self.cfg.rag_mode == "lexical" or self.cfg.vector_store == "sql":
                chunks = s.scalars(select(Chunk).where(Chunk.document_id.in_(doc_map))).all()
        scored = []
        if self.cfg.rag_mode == "lexical":
            words = set(re.findall(r"\w+", query.lower()))
            for c in chunks:
                terms = set(re.findall(r"\w+", c.content.lower()))
                score = len(words & terms) / max(1, len(words))
                if score > 0:
                    scored.append((score, c))
        else:
            self.embedding_access(user)
            vectors, usage = await self.providers.embed([query])
            if charge:
                charge(*usage, "embedding")
            vector = vectors[0]
            if self.cfg.vector_store == "qdrant":
                response = await self.qrequest(
                    "POST",
                    f"/collections/{self.cfg.qdrant_collection}/points/query",
                    {
                        "query": vector,
                        "filter": {
                            "must": [
                                {"key": "document_id", "match": {"any": list(doc_map)}},
                                {
                                    "key": "embedding_model",
                                    "match": {"value": self.cfg.embedding_model},
                                },
                            ]
                        },
                        "limit": self.cfg.rag_top_k,
                        "with_payload": True,
                    },
                )
                points = response["result"]["points"][: self.cfg.rag_top_k]
                ids = [point["payload"]["chunk_id"] for point in points]
                with self.db.read() as s:
                    chunks = s.scalars(
                        select(Chunk).where(
                            Chunk.id.in_(ids),
                            Chunk.document_id.in_(doc_map),
                            Chunk.embedding_model == self.cfg.embedding_model,
                        )
                    ).all()
                chunk_map = {c.id: c for c in chunks}
                for point in points:
                    chunk = chunk_map.get(point["payload"]["chunk_id"])
                    if chunk and chunk.document_id in doc_map:
                        scored.append((point["score"], chunk))
            else:
                norm = math.sqrt(sum(v * v for v in vector)) or 1
                for c in chunks:
                    if (
                        not c.vector
                        or len(c.vector) != len(vector)
                        or c.embedding_model != self.cfg.embedding_model
                    ):
                        continue
                    denominator = norm * (math.sqrt(sum(x * x for x in c.vector)) or 1)
                    score = sum(a * b for a, b in zip(vector, c.vector, strict=True)) / denominator
                    scored.append((score, c))
        return [
            {
                "document": {**doc_map[c.document_id].data, "id": c.document_id},
                "page": c.page,
                "relevance": round(max(0, min(1, score)), 4),
                "content": c.content,
            }
            for score, c in sorted(scored, key=lambda pair: pair[0], reverse=True)[
                : self.cfg.rag_top_k
            ]
        ]
