# Meeting Assistant Backend (Python Vision Agent)

This backend runs an AI meeting assistant bot using Stream Vision Agents and Google Gemini AI.

## Features
- **Auto-transcription**: Automatically listens to the meeting participants and saves transcripts.
- **Smart Q&A**: When anyone in the meeting says `"Hey Assistant" <question>`, the assistant bot answers using Gemini Realtime AI based on the meeting context.
- **Auto Note-taking (`main-alt.py`)**: Summarizes the meeting discussions and sends notes to the frontend transcript panel.

## Setup

1. Make sure Python 3.10+ is installed.
2. (Recommended) Create a virtual environment:
   ```bash
   python -m venv .venv
   .\.venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. In `backend/.env`, set your `GEMINI_API_KEY`:
   ```env
   STREAM_API_KEY=58ujwujjs6b9
   STREAM_API_SECRET=n95fj2d7hsu7svc3h7rqg3gv8qhcc3u7kaqs48nbf6tubnh3vhmma5gqbjesb2u7
   CALL_ID=demo-call
   GEMINI_API_KEY=your_gemini_api_key
   ```
5. Run the assistant bot:
   ```bash
   python main.py
   # OR with auto-note taking:
   python main-alt.py
   ```
