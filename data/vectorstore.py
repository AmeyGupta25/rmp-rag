from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
import pandas as pd
import os
from dotenv import load_dotenv
import uuid

load_dotenv()

model = SentenceTransformer('all-MiniLM-L6-v2')
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index(os.getenv("PINECONE_INDEX"))

def build_document(row):
    text = f"""
    Professor: {row['professor']}
    Department: {row.get('department', 'Unknown')}
    Class: {row.get('class', 'Unknown')}
    Overall Rating: {row.get('avg_rating', 'N/A')}/5
    Difficulty: {row.get('avg_difficulty', 'N/A')}/5
    Would Take Again: {row.get('would_take_again', 'Unknown')}
    Grade Received: {row.get('grade', 'N/A')}
    Student Review: {row['comment']}
    """.strip()
    return text

def upload_reviews():
    df = pd.read_csv("data/reviews.csv")
    df = df.dropna(subset=["comment"])
    print(f"Uploading {len(df)} reviews to Pinecone...")

    batch_size = 100
    for i in range(0, len(df), batch_size):
        batch = df.iloc[i:i+batch_size]
        documents = [build_document(row) for _, row in batch.iterrows()]
        embeddings = model.encode(documents).tolist()

        vectors = []
        for j, (_, row) in enumerate(batch.iterrows()):
            vectors.append({
                "id": str(uuid.uuid4()),
                "values": embeddings[j],
                "metadata": {
                    "text": documents[j],
                    "professor": str(row.get("professor", "")),
                    "department": str(row.get("department", "")),
                    "class": str(row.get("class", "")),
                    "avg_rating": float(row.get("avg_rating", 0)),
                    "avg_difficulty": float(row.get("avg_difficulty", 0)),
                }
            })

        index.upsert(vectors=vectors)
        print(f"Uploaded batch {i//batch_size + 1}/{(len(df)-1)//batch_size + 1}")

    print(f"Done! {len(df)} reviews uploaded to Pinecone.")

def query(question, top_k=8):
    embedding = model.encode([question]).tolist()[0]
    results = index.query(vector=embedding, top_k=top_k, include_metadata=True)
    return [match["metadata"]["text"] for match in results["matches"]]

if __name__ == "__main__":
    upload_reviews()