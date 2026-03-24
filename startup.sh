#!/bin/bash
echo "Pre-loading sentence transformer model..."
python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
echo "Starting RMP RAG API..."
uvicorn api.main:app --host 0.0.0.0 --port $PORT