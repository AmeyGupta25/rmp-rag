# UCSD ProfAI

An AI-powered chatbot for UCSD students to ask natural language questions about professors, grounded in real Rate My Professor reviews.

## Live Demo

- **Frontend:** https://rmp-rag-ten.vercel.app
- **API:** https://rmp-rag-api.onrender.com
- **API Docs:** https://rmp-rag-api.onrender.com/docs

## Features

- Ask natural language questions about any UCSD professor
- Answers grounded in 7,565 real student reviews from Rate My Professor
- Conversation memory (the AI remembers context across your session)
- Filter questions by department
- Browse and search through 500 professors with ratings, difficulty, and review counts
- Professor rating cards shown inline when the AI mentions a professor

## Tech Stack

| Layer | Technology |
|---|---|
| Scraping | Python, RMP GraphQL API |
| Vector DB | Pinecone (multilingual-e5-large, 1024 dims) |
| LLM | Groq (llama-3.3-70b-versatile) |
| Backend | FastAPI |
| Frontend | React |
| Hosting | Render (API), Vercel (frontend) |

## How It Works

1. **Scrape** -> 7,565 reviews from 500 UCSD professors are scraped from Rate My Professor
2. **Embed** -> reviews are embedded using Pinecone's multilingual-e5-large model and stored in a Pinecone vector index
3. **Retrieve** -> when a user asks a question, the most relevant reviews are retrieved via semantic search
4. **Generate** -> Groq's LLaMA 3.3 70B model generates a grounded answer using the retrieved reviews as context

## Local Setup

### Prerequisites
- Python 3.10+
- Node.js
- A Pinecone account and index named `rmp-rag` (1024 dims, cosine metric)
- A Groq API key

### Backend
```bash
cd rmp-rag
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the root:
```
GROQ_API_KEY=your_groq_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=rmp-rag
```

Start the API:
```bash
uvicorn api.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm start
```

Create a `.env` file in `frontend/`:
```
REACT_APP_API_URL=http://localhost:8000
```

## Project Structure
```
rmp-rag/
├── api/          # FastAPI backend
├── data/         # Scraped professor data (professors.csv)
├── frontend/     # React frontend
└── scraper/      # RMP scraping scripts
```