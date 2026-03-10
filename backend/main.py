import os
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from google import genai
from google.genai import types

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi.responses import JSONResponse

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
EXTENSION_API_KEY = os.getenv("EXTENSION_API_KEY")
ALLOWED_EXTENSION_ID = os.getenv("ALLOWED_EXTENSION_ID", "")

if not GEMINI_API_KEY:
    raise ValueError("Missing GEMINI_API_KEY")
if not EXTENSION_API_KEY:
    raise ValueError("Missing EXTENSION_API_KEY")

client = genai.Client(api_key=GEMINI_API_KEY)
MODEL = "gemini-2.0-flash"

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

# ── Pydantic models ───────────────────────────────────────────────────────────

class TextRequest(BaseModel):
    text: str = Field(..., max_length=8000)


class ExplainRequest(BaseModel):
    text: str = Field(..., max_length=3000)  # ~500 words — keeps costs low
    use_search: bool = False


class ChatRequest(BaseModel):
    question: str = Field(..., max_length=1000)
    context: str = Field(..., max_length=8000)
    use_search: bool = False


# ── Auth ──────────────────────────────────────────────────────────────────────

def verify_extension_key(request: Request):
    origin = request.headers.get("origin", "")
    if not origin.startswith("chrome-extension://"):
        raise HTTPException(status_code=403, detail="Unauthorized origin")

    if ALLOWED_EXTENSION_ID:
        expected_origin = f"chrome-extension://{ALLOWED_EXTENSION_ID}"
        if origin != expected_origin:
            raise HTTPException(status_code=403, detail="Unauthorized extension")

    key = request.headers.get("x-extension-key")
    if key != EXTENSION_API_KEY:
        raise HTTPException(status_code=403, detail="Unauthorized")


# ── Helper ────────────────────────────────────────────────────────────────────

def generate(prompt: str, use_search: bool = False) -> str:
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())] if use_search else []
    )
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=config,
    )
    return response.text


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Jaadu backend running"}


@app.post("/ai/summarize")
@limiter.limit("20/minute")
def summarize(request: Request, req: TextRequest, _: None = Depends(verify_extension_key)):
    try:
        prompt = f"Summarize the following text in clear, concise bullet points:\n\n{req.text}"
        return {"result": generate(prompt)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/explain")
@limiter.limit("20/minute")
def explain(request: Request, req: ExplainRequest, _: None = Depends(verify_extension_key)):
    try:
        if req.use_search:
            prompt = (
                "Search the web to find accurate, up-to-date information and explain "
                "the following in simple, clear language. Cite your sources.\n\n"
                f"{req.text}"
            )
        else:
            prompt = (
                "Explain the following text in simple, clear language. "
                "Base your explanation ONLY on the text provided below. "
                "Do NOT add facts, names, or details that are not present in the text. "
                "If the text is too vague or doesn't contain enough information to explain, "
                "say so honestly instead of guessing.\n\n"
                f"Text to explain:\n{req.text}"
            )
        return {"result": generate(prompt, use_search=req.use_search)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/chat")
@limiter.limit("20/minute")
def chat(request: Request, req: ChatRequest, _: None = Depends(verify_extension_key)):
    try:
        if req.use_search:
            prompt = f"""You are a helpful assistant. The user is currently on a webpage.
Search the web for additional context if needed to give the best answer.

Page content:
{req.context}

User question:
{req.question}

Answer clearly and concisely, citing sources where relevant."""
        else:
            prompt = f"""You are a helpful assistant answering questions about a webpage.

Page content:
{req.context}

User question:
{req.question}

Answer clearly and concisely."""
        return {"result": generate(prompt, use_search=req.use_search)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
