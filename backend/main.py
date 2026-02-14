import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in environment")

genai.configure(api_key=API_KEY)

app= FastAPI()

model = genai.GenerativeModel('gemini-2.5-flash')

class TextRequest(BaseModel):
    text:str

class ChatRequest(BaseModel):
    message:str

@app.get("/")
def root():
    return {"status": "Jaadu backend running"}

@app.post("/ai/summarize")
def summarize(request:TextRequest):
    try:
        prompt= f"Summarize the text into clear, consise bullet points:\n\n{request.text}"
        response = model.generate_content(prompt)
        return {"result": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai/explain")
def explain(requesr:TextRequest):
    try:
        prompt = f"Explain the following test into simple, clear, well structured language:\n\n{request.text}"
        response = model.generate_content(prompt)
        return {"result": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai/chat")
def chat(req: ChatRequest):
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