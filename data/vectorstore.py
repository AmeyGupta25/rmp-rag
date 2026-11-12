import os

from dotenv import load_dotenv
from pinecone import Pinecone

load_dotenv()

pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index(os.getenv("PINECONE_INDEX"))
# "" is the original (pre-pipeline) namespace; set to "reviews" once pipeline.embed has filled it.
NAMESPACE = os.getenv("PINECONE_NAMESPACE", "")


def query(question, top_k=8, department=""):
    result = pc.inference.embed(
        model="multilingual-e5-large",
        inputs=[question],
        parameters={"input_type": "query"}
    )
    results = index.query(
        vector=result[0].values,
        top_k=top_k,
        include_metadata=True,
        namespace=NAMESPACE,
        filter={"department": {"$eq": department}} if department else None,
    )
    return [match["metadata"]["text"] for match in results["matches"]]
