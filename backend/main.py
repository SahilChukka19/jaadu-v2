import os
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import google.generativeai as genai

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi.responses import JSONResponse

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
EXTENSION_API_KEY = os.getenv("EXTENSION_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("Missing GEMINI_API_KEY")

if not EXTENSION_API_KEY:
    raise ValueError("Missing EXTENSION_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

app = FastAPI()

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda r, e: JSONResponse(
    status_code=429,
    content={"detail": "Too many requests. Slow down."}
))
app.add_middleware(SlowAPIMiddleware)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TextRequest(BaseModel):
    text: str = Field(..., max_length=8000)


class ChatRequest(BaseModel):
    question: str = Field(..., max_length=1000)
    context: str = Field(..., max_length=8000)


def verify_extension_key(request: Request):
    key = request.headers.get("x-extension-key")
    if key != EXTENSION_API_KEY:
        raise HTTPException(status_code=403, detail="Unauthorized")


# Health check
@app.get("/")
def root():
    return {"status": "Jaadu backend running"}


# Summarize endpoint
@app.post("/ai/summarize")
@limiter.limit("20/minute")
def summarize(request: Request, req: TextRequest, _: None = Depends(verify_extension_key)):
    try:
        prompt = f"Summarize the following text in clear, concise bullet points:\n\n{req.text}"
        response = model.generate_content(prompt)
        return {"result": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Explain endpoint
@app.post("/ai/explain")
@limiter.limit("20/minute")
def explain(request: Request, req: TextRequest, _: None = Depends(verify_extension_key)):
    try:
        prompt = f"Explain this in simple, clear language:\n\n{req.text}"
        response = model.generate_content(prompt)
        return {"result": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Chat endpoint
@app.post("/ai/chat")
@limiter.limit("20/minute")
def chat(request: Request, req: ChatRequest, _: None = Depends(verify_extension_key)):
    try:
        prompt = f"""
You are a helpful assistant answering questions about a webpage.

Page content:
{req.context}

User question:
{req.question}

Answer clearly and concisely.
"""
        response = model.generate_content(prompt)
        return {"result": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
