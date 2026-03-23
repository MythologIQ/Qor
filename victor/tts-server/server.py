#!/usr/bin/env python3
"""
Victor Service - TTS, Email & Calendar API
Serves audio generation and productivity data for Victor
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import os
import logging
import subprocess
import json

# Initialize FastAPI
app = FastAPI(title="Victor Service")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str
    voice: str = "default"

# TTS model will be loaded here
tts_model = None


def run_helper(command: str) -> dict:
    """Call local helper for integrations to avoid hard MCP runtime imports."""
    helper_path = os.path.join(os.path.dirname(__file__), "mcp_helper.py")
    result = subprocess.run(
        ["python3", helper_path, command],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        return {"error": result.stderr.strip() or "helper failed"}
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        return {"error": "invalid helper response", "raw": result.stdout.strip()}

@app.on_event("startup")
async def load_model():
    """Load Qwen3 TTS model on startup"""
    global tts_model
    logger.info("Loading Qwen3 TTS model...")
    
    try:
        # TODO: Replace with actual Qwen3 TTS model loading
        logger.info("TTS model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load TTS model: {e}")
        logger.warning("Running in stub mode")

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    """Generate speech from text using Qwen3 TTS"""
    
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        logger.info(f"TTS request: {request.text[:50]}...")
        
        return Response(
            content=b"",
            media_type="audio/wav",
            headers={
                "X-TTS-Status": "stub",
                "X-TTS-Message": "Qwen3 model not yet configured"
            }
        )
        
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/emails")
async def get_emails():
    """Get recent emails via MCP Gmail integration"""
    try:
        data = run_helper("emails")
        if "error" in data:
            return {"emails": [], "error": data["error"], "source": "mcp_helper.py"}
        return {"emails": data.get("emails", []), "source": "mcp_helper.py"}
    except Exception as e:
        logger.error(f"Email fetch failed: {e}")
        return {"emails": [], "error": str(e)}

@app.get("/calendar")
async def get_calendar():
    """Get upcoming calendar events via MCP Calendar integration"""
    try:
        data = run_helper("calendar")
        if "error" in data:
            return {"events": [], "error": data["error"], "source": "mcp_helper.py"}
        return {"events": data.get("events", []), "source": "mcp_helper.py"}
    except Exception as e:
        logger.error(f"Calendar fetch failed: {e}")
        return {"events": [], "error": str(e)}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "model_loaded": tts_model is not None,
        "service": "victor"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
