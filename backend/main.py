from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import google.generativeai as genai
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
import chromadb
import uuid
from pydantic import BaseModel
from typing import List


class QuestionRequest(BaseModel):
    question: str
    model: str = "gemini-2.5-flash-lite"   # CHANGED: UI dropdown nunchi model

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

ALLOWED_MODELS = {"gemini-2.5-flash", "gemini-2.5-flash-lite"}   # CHANGED


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


@app.post("/ask")
def ask_question(request: QuestionRequest):
    try:
        question = request.question

        # CHANGED: UI nunchi vచ్చిన model vాడu (safe ga check chesi)
        chosen_model = request.model if request.model in ALLOWED_MODELS else "gemini-2.5-flash-lite"

        query_embedding = embedding_model.embed_query(question)

        results = collection.query(query_embeddings=[query_embedding], n_results=3)

        documents = results["documents"][0]
        metadatas = results["metadatas"][0]

        context = "\n".join(documents)

        sources = []
        for doc, meta in zip(documents, metadatas):
            meta = meta or {}
            sources.append({
                "source": meta.get("source", "document"),
                "snippet": doc[:200] + ("..." if len(doc) > 200 else ""),
            })

        prompt = f"""
You are a smart, friendly assistant (like ChatGPT).

Use the CONTEXT below (from the user's uploaded PDF) to answer the QUESTION.

Rules:
- If the context contains the answer, answer from it clearly and completely.
- If the context does NOT have the answer, use your own general knowledge to answer,
  and begin that part with "(From general knowledge)".
- Be conversational and helpful. Never reply with a one-line "I could not find" dismissal.

CONTEXT:
{context}

QUESTION:
{question}
"""

        model = genai.GenerativeModel(chosen_model)
        response = model.generate_content(prompt)

        return {"question": question, "answer": response.text, "sources": sources}

    except Exception as e:
        return {"error": str(e)}