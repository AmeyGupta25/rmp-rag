# UCSD ProfAI

An AI-powered chatbot for UCSD students to ask natural language questions about professors, grounded in real Rate My Professor reviews.

## Live Demo

- **Frontend:** https://profai.ameygupta.com
- **API:** https://api.profai.ameygupta.com
- **API Docs:** https://api.profai.ameygupta.com/docs

## Features

- Ask natural language questions about any UCSD professor
- Answers grounded in 21,649 real student reviews from Rate My Professor, with citations
- Filter questions by department
- Search 500 professors and every reviewed class, with filters for rating, difficulty, grades and class style
- Compare up to three professors side by side
- Professor rating cards shown inline when the AI mentions a professor

## Tech Stack

| Layer | Technology |
|---|---|
| Pipeline | Python, RMP GraphQL API, S3, dbt + DuckDB, GitHub Actions (weekly) |
| Vector DB | Pinecone (multilingual-e5-large, 1024 dims) |
| LLM | Groq (openai/gpt-oss-120b) |
| Backend | FastAPI |
| Frontend | React (Vite) |
| Hosting | Render (API), Vercel (frontend) |

## How It Works

1. **Scrape** -> every week, new reviews of 500 UCSD professors are pulled from Rate My Professor and modeled with dbt
2. **Embed** -> reviews are embedded using Pinecone's multilingual-e5-large model and stored in a Pinecone vector index
3. **Retrieve** -> when a user asks a question, the most relevant reviews are retrieved via semantic search
4. **Generate** -> Groq's gpt-oss-120b model generates a grounded answer using the retrieved reviews as context

## Local Setup

### Prerequisites
- Python 3.12
- Node.js
- A Pinecone account and index named `rmp-rag` (1024 dims, cosine metric)
- A Groq API key

### Backend
```bash
cd rmp-rag
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Create a `.env` file in the root:
```
GROQ_API_KEY=your_groq_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=rmp-rag
```

Build the data the API reads (`data/serving.duckdb`; the first run scrapes every professor and takes a while):
```bash
python -m pipeline.run --skip-embed
```

Start the API:
```bash
uvicorn api.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Create a `.env` file in `frontend/`:
```
REACT_APP_API_URL=http://localhost:8000
```

## Project Structure
```
rmp-rag/
├── api/          # FastAPI backend
├── data/         # Local warehouse and serving data (not in git), Pinecone client
├── eval/         # Retrieval and answer evaluation
├── frontend/     # React (Vite) frontend
├── infra/        # AWS setup (S3, IAM)
├── pipeline/     # Extract, embed, LLM backfill, publish
├── tests/        # pytest suite and synthetic fixtures
└── transform/    # dbt models and data tests
```