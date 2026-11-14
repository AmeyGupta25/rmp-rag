import os

from dotenv import load_dotenv
from pinecone import Pinecone

load_dotenv()

pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index(os.getenv("PINECONE_INDEX"))
# The namespace the weekly pipeline (pipeline.embed) fills, so chat sees new reviews.
NAMESPACE = os.getenv("PINECONE_NAMESPACE", "reviews")


def search(question, top_k=8, department="", namespace=None):
    """Top matches as [{"id", "text"}]. The id is the RMP review id (pipeline namespace)."""
    result = pc.inference.embed(
        model="multilingual-e5-large",
        inputs=[question],
        parameters={"input_type": "query"}
    )
    results = index.query(
        vector=result[0].values,
        top_k=top_k,
        include_metadata=True,
        namespace=NAMESPACE if namespace is None else namespace,
        filter={"department": {"$eq": department}} if department else None,
    )
    return [{"id": m["id"], "text": m["metadata"]["text"]} for m in results["matches"]]


def rerank(question, matches, top_n=8):
    """Reorder matches with a cross-encoder. Falls back to the original order if the
    reranking service is unavailable, so answers never fail because of it."""
    if not matches:
        return matches
    try:
        ranked = pc.inference.rerank(
            model="bge-reranker-v2-m3", query=question,
            documents=[m["text"] for m in matches], top_n=top_n, return_documents=False,
        )
        return [matches[r.index] for r in ranked.data]
    except Exception as e:
        print(f"rerank skipped: {type(e).__name__}")
        return matches[:top_n]


def query(question, top_k=8, department=""):
    return [m["text"] for m in search(question, top_k, department)]
