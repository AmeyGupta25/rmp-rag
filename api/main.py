from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from data.vectorstore import query
from dotenv import load_dotenv
import os
import pandas as pd

load_dotenv()

app = FastAPI(title="RMP RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYSTEM_PROMPT = """You are a helpful assistant for UCSD students trying to find the best professors.
You are given real student reviews from Rate My Professor as context.
Answer the student's question based ONLY on the reviews provided.
Be specific — mention professor names, departments, and quote or paraphrase reviews when relevant.
If the reviews don't contain enough information to answer, say so honestly.
Keep answers concise but helpful — 3 to 5 sentences max unless a longer answer is clearly needed.
Never make up information that isn't in the reviews.
You have access to the conversation history — use it to answer follow-up questions naturally."""

class Message(BaseModel):
    role: str
    content: str

class Question(BaseModel):
    question: str
    history: list[Message] = []
    department: str = ""

@app.get("/")
def root():
    return {"message": "RMP RAG API is running"}

@app.post("/ask")
def ask(body: Question):
    question = body.question
    history = body.history
    department = body.department

    search_query = question
    if history:
        last = history[-1].content if history else ""
        search_query = f"{last} {question}"

    context_chunks = query(search_query, top_k=8, department=department)
    context = "\n\n---\n\n".join(context_chunks)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Context from Rate My Professor reviews:\n\n{context}"}
    ]

    for msg in history[-6:]:
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": question})

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.3,
        max_tokens=500
    )

    answer = response.choices[0].message.content

    professors_mentioned = extract_professors(answer)

    return {
        "question": question,
        "answer": answer,
        "sources": context_chunks[:3],
        "professors": professors_mentioned
    }

def extract_professors(answer):
    try:
        df = pd.read_csv("data/professors.csv")
        mentioned = []
        for _, row in df.iterrows():
            if row["name"] in answer:
                mentioned.append({
                    "name": row["name"],
                    "department": row.get("department", ""),
                    "avg_rating": row.get("avg_rating", 0),
                    "avg_difficulty": row.get("avg_difficulty", 0),
                    "num_ratings": row.get("num_ratings", 0),
                    "would_take_again": row.get("would_take_again", 0)
                })
        return mentioned[:3]
    except:
        return []

@app.get("/professors")
def get_professors(department: str = "", sort: str = "rating", search: str = ""):
    df = pd.read_csv("data/professors.csv")
    if department:
        df = df[df["department"].str.contains(department, case=False, na=False)]
    if search:
        df = df[df["name"].str.contains(search, case=False, na=False)]
    if sort == "rating":
        df = df.sort_values("avg_rating", ascending=False)
    elif sort == "difficulty":
        df = df.sort_values("avg_difficulty", ascending=True)
    elif sort == "num_ratings":
        df = df.sort_values("num_ratings", ascending=False)
    df = df.fillna(0)
    return {
        "professors": df.head(50).to_dict(orient="records"),
        "total": len(df)
    }

@app.get("/departments")
def get_departments():
    df = pd.read_csv("data/professors.csv")
    departments = sorted(df["department"].dropna().unique().tolist())
    return {"departments": departments}