#!/bin/bash
echo "Starting RMP RAG API..."
uvicorn api.main:app --host 0.0.0.0 --port $PORT