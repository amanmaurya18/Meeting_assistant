# Meeting Assistant

An AI-powered Smart Meeting Assistant web application built with Next.js, Stream Video & Audio SDK, and Google Gemini AI.

---

## 🌟 Features

- **Video & Audio Calling**: High quality, low-latency video conferencing powered by Stream Video SDK.
- **Real-time Live Transcripts**: Automatic live speech transcription for all meeting participants.
- **Smart AI Assistant**: Mention `"Hey Assistant"` or query the bot to get instant, context-aware answers directly inside the meeting.
- **Automated Meeting Notes**: Summarizes discussions and captures key action items.

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js 18+ and npm
- Python 3.10+ (for running the AI agent backend)

### 2. Environment Setup

Copy `.env.example` to `.env.local` in the root directory and fill in your API credentials:

```bash
cp .env.example .env.local
```

Configure your Stream Video and Gemini API keys:
```env
STREAM_API_KEY=your_stream_api_key
STREAM_API_SECRET=your_stream_api_secret
NEXT_PUBLIC_STREAM_API_KEY=your_stream_api_key
NEXT_PUBLIC_CALL_ID=demo-call
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Frontend Setup (Next.js)

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Backend Setup (AI Agent)

In a separate terminal, set up and run the Python AI agent:

```bash
cd backend
python -m venv .venv
# On Windows:
.\.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 (Turbopack, App Router), React 19, Tailwind CSS
- **RTC & Messaging**: Stream Video React SDK, Stream Chat
- **Backend & AI**: Python 3.10+, Google Gemini AI, Stream Vision Agents
