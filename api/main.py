from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from data.vectorstore import query
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="RMP RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class Question(BaseModel):
    question: str

SYSTEM_PROMPT = """You are a helpful assistant for UCSD students trying to find the best professors.
You are given real student reviews from Rate My Professor as context.
Answer the student's question based ONLY on the reviews provided.
Be specific — mention professor names, departments, and quote or paraphrase reviews when relevant.
If the reviews don't contain enough information to answer, say so honestly.
Keep answers concise but helpful — 3 to 5 sentences max unless a longer answer is clearly needed.
Never make up information that isn't in the reviews."""

@app.get("/")
def root():
    return {"message": "RMP RAG API is running"}

@app.post("/ask")
def ask(body: Question):
    question = body.question
    context_chunks = query(question, top_k=8)
    context = "\n\n---\n\n".join(context_chunks)

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Context from Rate My Professor reviews:\n\n{context}\n\nStudent question: {question}"}
        ],
        temperature=0.3,
        max_tokens=500
    )

    answer = response.choices[0].message.content
    return {
        "question": question,
        "answer": answer,
        "sources": context_chunks[:3]
    }

@app.get("/professors")
def get_professors():
    import pandas as pd
    df = pd.read_csv("data/professors.csv")
    df = df.sort_values("avg_rating", ascending=False)
    return {"professors": df.head(20).to_dict(orient="records")}