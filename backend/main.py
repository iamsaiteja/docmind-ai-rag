from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import shutil
import os
import json
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import google.generativeai as genai
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
import chromadb
import uuid
from pydantic import BaseModel
from typing import List


class ChatMessage(BaseModel):
    role: str          # "user" | "assistant"
    content: str


class QuestionRequest(BaseModel):
    question: str
    model: str = "gemini-2.5-flash-lite"   # UI dropdown nunchi model
    history: List[ChatMessage] = []        # conversation memory (multi-turn)


class TitleRequest(BaseModel):
    question: str
    answer: str = ""


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

embedding_model = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001")

client = chromadb.PersistentClient(path="chroma_db")
collection = client.get_or_create_collection(name="documents")

ALLOWED_MODELS = {"gemini-2.5-flash", "gemini-2.5-flash-lite"}


@app.get("/")
def home():
    return {"message": "Welcome to Enterprise RAG System 🚀"}


def extract_text_from_pdf(file_path):
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text
    return text


def create_chunks(text):
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    return splitter.split_text(text)


def store_embeddings(chunks, source):
    for chunk in chunks:
        embedding = embedding_model.embed_query(chunk)
        collection.add(
            ids=[str(uuid.uuid4())],
            embeddings=[embedding],
            documents=[chunk],
            metadatas=[{"source": source}],
        )


@app.post("/upload-pdf")
async def upload_pdf(files: List[UploadFile] = File(...)):
    uploaded = []
    for file in files:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        text = extract_text_from_pdf(file_path)
        chunks = create_chunks(text)
        store_embeddings(chunks, source=file.filename)
        uploaded.append({"filename": file.filename, "total_chunks": len(chunks)})
    return {"message": "PDF(s) uploaded successfully", "files": uploaded}


def retrieve_context(question):
    """Vector search — returns (context_text, sources). Empty collection ayite silent ga skip."""
    try:
        if collection.count() == 0:
            return "", []
        query_embedding = embedding_model.embed_query(question)
        results = collection.query(query_embeddings=[query_embedding], n_results=4)
        documents = results["documents"][0]
        metadatas = results["metadatas"][0]
    except Exception:
        return "", []

    sources = []
    for doc, meta in zip(documents, metadatas):
        meta = meta or {}
        sources.append({
            "source": meta.get("source", "document"),
            "snippet": doc[:200] + ("..." if len(doc) > 200 else ""),
        })
    return "\n".join(documents), sources


def build_prompt(question, context, history):
    """Conversation history + RAG context tho full prompt build cheyyi."""
    history_text = ""
    for m in history[-10:]:  # last 10 turns matrame — token limit safe
        speaker = "User" if m.role == "user" else "Assistant"
        history_text += f"{speaker}: {m.content}\n\n"

    return f"""
You are DocMind — a smart, friendly AI assistant (like ChatGPT, but better).

Use the CONTEXT below (from the user's uploaded PDFs) to answer the QUESTION.

Rules:
- If the context contains the answer, answer from it clearly and completely.
- If the context does NOT have the answer, use your own general knowledge to answer,
  and begin that part with "(From general knowledge)".
- Use the CONVERSATION HISTORY to understand follow-up questions, pronouns
  ("it", "that", "he"), and what the user is referring to.
- Format your answers with rich Markdown: use **bold** for key terms, bullet or
  numbered lists for steps, tables for comparisons, and ```code blocks``` for code.
- Be conversational and helpful. Never reply with a one-line "I could not find" dismissal.
- Answer in the same language the user asked in.

CONVERSATION HISTORY:
{history_text if history_text else "(no previous messages)"}

CONTEXT:
{context if context else "(no documents uploaded)"}

QUESTION:
{question}
"""


@app.post("/ask")
def ask_question(request: QuestionRequest):
    """Non-streaming endpoint — old clients ki backward compatible."""
    try:
        chosen_model = request.model if request.model in ALLOWED_MODELS else "gemini-2.5-flash-lite"

        context, sources = retrieve_context(request.question)
        prompt = build_prompt(request.question, context, request.history)

        model = genai.GenerativeModel(chosen_model)
        response = model.generate_content(prompt)

        return {"question": request.question, "answer": response.text, "sources": sources}

    except Exception as e:
        return {"error": str(e)}


@app.post("/ask-stream")
def ask_question_stream(request: QuestionRequest):
    """ChatGPT-style real-time streaming (Server-Sent Events).

    Events:
      {"type": "sources", "sources": [...]}   — retrieval done, sources ready
      {"type": "delta",   "text": "..."}      — next piece of the answer
      {"type": "done"}                        — answer complete
      {"type": "error",   "message": "..."}   — something failed
    """
    chosen_model = request.model if request.model in ALLOWED_MODELS else "gemini-2.5-flash-lite"

    def sse(payload):
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def event_stream():
        try:
            context, sources = retrieve_context(request.question)
            yield sse({"type": "sources", "sources": sources})

            prompt = build_prompt(request.question, context, request.history)
            model = genai.GenerativeModel(chosen_model)
            response = model.generate_content(prompt, stream=True)

            for chunk in response:
                try:
                    text = chunk.text
                except Exception:
                    text = ""
                if text:
                    yield sse({"type": "delta", "text": text})

            yield sse({"type": "done"})
        except Exception as e:
            yield sse({"type": "error", "message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",   # proxy buffering off (Render/nginx)
        },
    )


@app.post("/generate-title")
def generate_title(request: TitleRequest):
    """First exchange tarvata chat ki short AI title — ChatGPT laga."""
    try:
        model = genai.GenerativeModel("gemini-2.5-flash-lite")
        prompt = f"""Generate a very short chat title (3-5 words) summarizing this conversation.
Reply with ONLY the title — no quotes, no punctuation at the end, same language as the user.

User: {request.question[:400]}
Assistant: {request.answer[:400]}"""
        response = model.generate_content(prompt)
        title = response.text.strip().strip('"').strip("'").strip()
        # single line matrame
        title = title.splitlines()[0][:60] if title else ""
        return {"title": title}
    except Exception as e:
        return {"title": "", "error": str(e)}
