# Placeholder for FastAPI app
# This file will be implemented as part of the MVP

from fastapi import FastAPI

app = FastAPI()

@app.get("/api/health")
async def health():
    return {"status": "ok"}

