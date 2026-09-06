"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useCall } from "@stream-io/video-react-sdk";
import { useChatContext } from "stream-chat-react";

export function TranscriptPanel({ userName = "Anonymous" }) {
  const { client } = useChatContext();
  const [transcripts, setTranscripts] = useState([]);
  const [interimText, setInterimText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [engineStatus, setEngineStatus] = useState("Connecting...");
  const [voiceName, setVoiceName] = useState("Female Voice");

  const transcriptEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const channelRef = useRef(null);
  const networkRetryTimeoutRef = useRef(null);
  const isAssistantSpeakingRef = useRef(false);
  const speechEndTimeoutRef = useRef(null);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const transcriptsRef = useRef(transcripts);
  transcriptsRef.current = transcripts;

  const call = useCall();

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, interimText]);

  // Dedicated Female Voice Selector
  const getFemaleVoice = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const femaleKeywords = [
      "zira",
      "jenny",
      "aria",
      "samantha",
      "karen",
      "victoria",
      "susan",
      "serena",
      "hazel",
      "female",
      "google us english"
    ];

    for (const kw of femaleKeywords) {
      const match = voices.find(
        (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes(kw)
      );
      if (match) return match;
    }

    const maleKeywords = ["david", "george", "mark", "richard", "james", "male", "guy"];
    const candidate = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        !maleKeywords.some((m) => v.name.toLowerCase().includes(m))
    );
    if (candidate) return candidate;

    return voices[0] || null;
  }, []);

  // Pre-fetch and cache available female voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const updateVoice = () => {
      const v = getFemaleVoice();
      if (v) {
        setVoiceName(v.name.replace(/(Microsoft|Google|Apple|Desktop|Online \(Natural\)|English \(United States\))/gi, "").replace(/[-–()]/g, "").trim() || "Female Voice");
      }
    };
    updateVoice();
    window.speechSynthesis.onvoiceschanged = updateVoice;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [getFemaleVoice]);

  // Stop assistant speech and safely resume speech recognition
  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (speechEndTimeoutRef.current) {
      clearTimeout(speechEndTimeoutRef.current);
      speechEndTimeoutRef.current = null;
    }
    isAssistantSpeakingRef.current = false;
    setIsAssistantSpeaking(false);
    setInterimText("");
    try {
      recognitionRef.current?.start();
    } catch {}
  }, []);

  // Voice output for Assistant using browser SpeechSynthesis
  const speakText = useCallback((text) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    try {
      if (speechEndTimeoutRef.current) {
        clearTimeout(speechEndTimeoutRef.current);
        speechEndTimeoutRef.current = null;
      }
      window.speechSynthesis.cancel();

      // Immediately silence speech recognition so the mic never catches assistant audio
      isAssistantSpeakingRef.current = true;
      setIsAssistantSpeaking(true);
      setInterimText("");
      try {
        recognitionRef.current?.stop();
      } catch {}

      const cleaned = text
        .replace(/[*#_`]/g, "")
        .replace(/•\s*/g, "Point: ")
        .replace(/\n+/g, ". ");

      const utterance = new SpeechSynthesisUtterance(cleaned);
      const femaleVoice = getFemaleVoice();
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      utterance.pitch = 1.18;
      utterance.rate = 1.03;

      utterance.onstart = () => {
        isAssistantSpeakingRef.current = true;
        setIsAssistantSpeaking(true);
        setInterimText("");
        try {
          recognitionRef.current?.stop();
        } catch {}
      };

      const handleSpeechDone = () => {
        // Buffer grace period (750ms) to allow speaker reverberation in the room to clear
        if (speechEndTimeoutRef.current) clearTimeout(speechEndTimeoutRef.current);
        speechEndTimeoutRef.current = setTimeout(() => {
          isAssistantSpeakingRef.current = false;
          setIsAssistantSpeaking(false);
          setInterimText("");
          try {
            recognitionRef.current?.start();
          } catch {}
        }, 750);
      };

      utterance.onend = handleSpeechDone;
      utterance.onerror = handleSpeechDone;

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis notice:", e);
      isAssistantSpeakingRef.current = false;
      setIsAssistantSpeaking(false);
    }
  }, [voiceEnabled, getFemaleVoice]);

  // Query Assistant function
  const askAssistant = useCallback(async (question) => {
    if (!question || !question.trim()) return;
    setIsAssistantThinking(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          transcripts: transcriptsRef.current,
        }),
      });

      const data = await res.json();
      const answer = data.answer || "I could not generate an answer at this time.";

      const assistantEntry = {
        text: answer,
        speaker: "Maya (Meeting Assistant)",
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
      };

      setTranscripts((prev) => [...prev, assistantEntry]);
      speakText(answer);

      // Broadcast to Stream channel
      try {
        if (channelRef.current && typeof channelRef.current.sendMessage === "function") {
          channelRef.current.sendMessage({
            text: answer,
            custom: { type: "assistant", source: data.source || "ai" },
          }).catch(() => {});
        }
      } catch (channelErr) {
        console.warn("Channel broadcast notice:", channelErr);
      }
    } catch (err) {
      console.error("Assistant query failed:", err);
      setTranscripts((prev) => [
        ...prev,
        {
          text: "Sorry, I had trouble processing that request. Please try again.",
          speaker: "Maya (Meeting Assistant)",
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
        },
      ]);
    } finally {
      setIsAssistantThinking(false);
    }
  }, [speakText]);

  // Robust Voice Trigger Handler for "Hey Assistant", "Assistant", "Maya", etc.
  const processVoiceTrigger = useCallback((spokenText) => {
    if (!spokenText) return;
    const lower = spokenText.toLowerCase();

    // Flexible regex for wake words: hey assistant, assistant, hi assistant, hello assistant, hey maya, maya, etc.
    const match = lower.match(/\b(?:hey|hi|hello|ok|okay)?\s*(?:assistant|assistance|maya)\b/i);
    if (!match) return;

    // Extract any question asked after the wake word
    const triggerEnd = match.index + match[0].length;
    const remaining = spokenText.slice(triggerEnd).replace(/^[,.?!:\s-]+/, "").trim();

    if (remaining.length === 0) {
      // User said JUST "Hey Assistant" / "Maya"! Respond immediately!
      const greeting = `Yes ${userName}, I'm listening! How can I help you with the meeting?`;
      setTranscripts((prev) => [
        ...prev,
        {
          text: greeting,
          speaker: "Maya (Meeting Assistant)",
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
        },
      ]);
      speakText(greeting);
    } else {
      // User asked a question: "Hey Assistant, what are the action items?"
      speakText("Checking meeting discussions now.");
      askAssistant(remaining);
    }
  }, [userName, speakText, askAssistant]);

  // Connect to Stream Chat Channel & Stream Closed Captions
  useEffect(() => {
    if (!call || !client) return;

    const callId = process.env.NEXT_PUBLIC_CALL_ID || "demo-call";
    const channel = client.channel("messaging", callId);
    channelRef.current = channel;

    channel.watch().catch(console.error);

    // Stream Cloud Closed Captions
    const handleClosedCaption = (event) => {
      // Ignore captions if assistant is speaking to prevent audio feedback
      if (isAssistantSpeakingRef.current) return;

      if (event.closed_caption) {
        const text = event.closed_caption.text?.trim();
        if (!text) return;

        const speakerId = event.closed_caption.user?.id || "";
        const speakerName =
          event.closed_caption.user?.name ||
          speakerId ||
          "Participant";

        // Ignore bot / assistant closed captions
        if (
          speakerId === "meeting-assistant-bot" ||
          speakerName.toLowerCase().includes("assistant") ||
          speakerName.toLowerCase().includes("maya")
        ) {
          return;
        }

        setTranscripts((prev) => {
          const isDuplicate = prev.slice(-3).some(
            (t) => t.text.toLowerCase() === text.toLowerCase()
          );
          if (isDuplicate) return prev;

          return [
            ...prev,
            {
              text,
              speaker: speakerName,
              timestamp: new Date(
                event.closed_caption.start_time || Date.now()
              ).toLocaleTimeString(),
            },
          ];
        });

        // Trigger voice assistant from closed captions
        processVoiceTrigger(text);
      }
    };

    // Chat messages from Stream channel
    const handleNewMessage = (event) => {
      const message = event.message;
      if (!message || message.user?.id === client.userID) return;

      if (message.custom?.type === "transcript") {
        if (
          message.user?.id === "meeting-assistant-bot" ||
          message.custom?.speaker?.toLowerCase().includes("assistant") ||
          message.custom?.speaker?.toLowerCase().includes("maya")
        ) {
          return;
        }
        setTranscripts((prev) => [
          ...prev,
          {
            text: message.text,
            speaker: message.custom?.speaker || message.user?.name || "Participant",
            timestamp: new Date(message.created_at || Date.now()).toLocaleTimeString(),
          },
        ]);
      } else if (message.user?.id === "meeting-assistant-bot" || message.custom?.type === "assistant") {
        let textContent = message.text;
        try {
          const parsed = JSON.parse(message.text);
          if (parsed.NOTES) {
            const notesArray = typeof parsed.NOTES === "string" ? JSON.parse(parsed.NOTES) : parsed.NOTES;
            textContent = Array.isArray(notesArray) ? notesArray.join("\n• ") : parsed.NOTES;
          }
        } catch {}

        setTranscripts((prev) => [
          ...prev,
          {
            text: textContent,
            speaker: "Maya (Meeting Assistant)",
            timestamp: new Date(message.created_at || Date.now()).toLocaleTimeString(),
            isBot: true,
          },
        ]);
      }
    };

    call.on("call.closed_caption", handleClosedCaption);
    channel.on("message.new", handleNewMessage);

    return () => {
      call.off("call.closed_caption", handleClosedCaption);
      channel.off("message.new", handleNewMessage);
    };
  }, [call, client, processVoiceTrigger]);

  // Local Browser Web Speech API for Instant Real-Time Preview
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setEngineStatus("Stream Live Captions");
      return;
    }

    let isComponentMounted = true;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      if (isComponentMounted) {
        setIsListening(true);
        setEngineStatus("Instant Live STT");
      }
    };

    recognition.onresult = (event) => {
      // If assistant is currently speaking or in post-speech grace period, ignore audio chunks
      if (isAssistantSpeakingRef.current) {
        setInterimText("");
        return;
      }

      let currentInterim = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptChunk = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          const cleanText = transcriptChunk.trim();
          if (cleanText.length > 0) {
            const newEntry = {
              text: cleanText,
              speaker: userName,
              timestamp: new Date().toLocaleTimeString(),
            };

            setTranscripts((prev) => [...prev, newEntry]);

            // Broadcast to chat channel
            try {
              if (channelRef.current && typeof channelRef.current.sendMessage === "function") {
                channelRef.current.sendMessage({
                  text: cleanText,
                  custom: { type: "transcript", speaker: userName },
                }).catch(() => {});
              }
            } catch {}

            // Trigger voice assistant
            processVoiceTrigger(cleanText);
          }
        } else {
          currentInterim += transcriptChunk;
        }
      }

      setInterimText(currentInterim);
    };

    recognition.onerror = (event) => {
      if (event.error === "network") {
        setIsListening(false);
        setEngineStatus("Stream Live Captions");
        if (networkRetryTimeoutRef.current) clearTimeout(networkRetryTimeoutRef.current);
        networkRetryTimeoutRef.current = setTimeout(() => {
          if (isComponentMounted && !isAssistantSpeakingRef.current) {
            try {
              recognition.start();
            } catch {}
          }
        }, 12000);
      } else if (event.error === "not-allowed") {
        setIsListening(false);
        setEngineStatus("Mic Access Required");
      }
    };

    recognition.onend = () => {
      if (!isComponentMounted) return;
      // Do not restart while assistant is speaking
      if (isAssistantSpeakingRef.current) {
        setIsListening(false);
        return;
      }
      if (!networkRetryTimeoutRef.current) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      }
    };

    try {
      recognition.start();
    } catch {
      setEngineStatus("Stream Live Captions");
    }

    return () => {
      isComponentMounted = false;
      if (networkRetryTimeoutRef.current) clearTimeout(networkRetryTimeoutRef.current);
      if (speechEndTimeoutRef.current) clearTimeout(speechEndTimeoutRef.current);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      try {
        recognition.onend = null;
        recognition.onerror = null;
        recognition.stop();
      } catch {}
    };
  }, [userName, processVoiceTrigger]);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700/80 bg-gradient-to-r from-gray-800 to-gray-850 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-lg border border-purple-500/30">
            <svg
              className="w-5 h-5 text-purple-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                Maya
                <span className="text-[10px] font-medium text-purple-300 px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30">
                  Female Voice
                </span>
              </h3>
              {isAssistantSpeaking ? (
                <span className="flex items-center gap-1 text-[11px] font-medium bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  Mic Paused (Speaking)
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  {engineStatus}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Say <span className="text-purple-300 font-semibold">"Hey Assistant"</span> or <span className="text-purple-300 font-semibold">"Maya"</span>
            </p>
          </div>
        </div>

        {/* Controls: Stop Audio & Voice TTS Toggle */}
        <div className="flex items-center gap-2">
          {isAssistantSpeaking && (
            <button
              onClick={stopSpeaking}
              title="Stop Maya Speaking and Resume Mic"
              className="px-2.5 py-1.5 rounded-lg border border-red-500/40 bg-red-500/20 text-red-200 hover:bg-red-500/30 text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              <span className="text-[11px] font-semibold hidden sm:inline">Stop Audio</span>
            </button>
          )}
          <button
            onClick={() => {
              setVoiceEnabled((v) => {
                if (v) stopSpeaking();
                return !v;
              });
            }}
            title={voiceEnabled ? `Female Voice (${voiceName}) Active - Click to mute` : "Voice Muted - Click to enable"}
            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition cursor-pointer ${
              voiceEnabled
                ? "bg-purple-500/20 border-purple-500/40 text-purple-200 hover:bg-purple-500/30"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {voiceEnabled ? (
              <>
                <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <span className="text-[11px] font-medium hidden sm:inline">Voice ON</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
                <span className="text-[11px] font-medium hidden sm:inline">Muted</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Action Pills */}
      <div className="px-4 py-2 bg-gray-800/60 border-b border-gray-700/60 flex items-center gap-2 overflow-x-auto text-xs">
        <button
          onClick={() => askAssistant("Summarize the meeting discussions so far with key decisions.")}
          disabled={isAssistantThinking}
          className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 active:bg-gray-600 text-gray-200 rounded-md border border-gray-600 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          <span>📝</span> Summarize
        </button>
        <button
          onClick={() => askAssistant("What are all the action items, tasks, and next steps discussed?")}
          disabled={isAssistantThinking}
          className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 active:bg-gray-600 text-gray-200 rounded-md border border-gray-600 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          <span>✅</span> Action Items
        </button>
        <button
          onClick={() => askAssistant("Who has spoken so far in this meeting and what were their main points?")}
          disabled={isAssistantThinking}
          className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 active:bg-gray-600 text-gray-200 rounded-md border border-gray-600 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          <span>👥</span> Attendees & Points
        </button>
      </div>

      {/* Transcript & Assistant Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-900/80">
        {transcripts.length === 0 && !interimText ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="relative mb-4">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700">
                <svg
                  className="w-8 h-8 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
              </div>
            </div>
            <p className="text-gray-200 font-semibold text-sm mb-1">
              Maya is ready & listening
            </p>
            <p className="text-gray-400 text-xs max-w-xs leading-relaxed">
              Say <span className="text-purple-300 font-semibold">"Hey Assistant"</span> or <span className="text-purple-300 font-semibold">"Maya"</span> anytime to get an instant answer!
            </p>
          </div>
        ) : (
          <>
            {transcripts.map((t, idx) => (
              <div
                key={idx}
                className={`rounded-xl p-3.5 shadow-md transition-all duration-200 border ${
                  t.isBot
                    ? "bg-gradient-to-br from-indigo-950/70 to-purple-950/60 border-purple-500/40 text-purple-100"
                    : "bg-gray-800/80 border-gray-700/80 text-gray-200 hover:border-gray-600"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow ${
                        t.isBot
                          ? "bg-gradient-to-br from-pink-500 to-purple-600"
                          : "bg-gradient-to-br from-blue-500 to-blue-600"
                      }`}
                    >
                      {t.isBot ? "M" : (t.speaker || "U").charAt(0).toUpperCase()}
                    </div>
                    <span
                      className={`font-semibold text-xs ${
                        t.isBot ? "text-purple-300" : "text-blue-400"
                      }`}
                    >
                      {t.speaker}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.isBot && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                        Gemini 3.6 AI
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 font-mono">
                      {t.timestamp}
                    </span>
                  </div>
                </div>
                <div className="text-xs leading-relaxed pl-8 whitespace-pre-line text-gray-100">
                  {t.text}
                </div>
              </div>
            ))}

            {/* Assistant Speaking Indicator */}
            {isAssistantSpeaking && (
              <div className="rounded-xl p-3 bg-purple-950/40 border border-purple-500/40 flex items-center justify-between gap-3 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1 items-end h-4">
                    <span className="w-1 bg-purple-400 rounded-full h-2 animate-bounce"></span>
                    <span className="w-1 bg-pink-400 rounded-full h-4 animate-bounce [animation-delay:0.15s]"></span>
                    <span className="w-1 bg-purple-400 rounded-full h-2.5 animate-bounce [animation-delay:0.3s]"></span>
                  </div>
                  <span className="text-xs text-purple-200 font-medium">
                    Maya is speaking... (Mic paused to prevent echo)
                  </span>
                </div>
                <button
                  onClick={stopSpeaking}
                  className="px-2 py-0.5 text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded cursor-pointer transition"
                >
                  Stop
                </button>
              </div>
            )}

            {/* Instant Live Speech Interim Preview */}
            {interimText && !isAssistantSpeaking && (
              <div className="rounded-xl p-3 bg-blue-950/40 border border-blue-500/50 text-blue-200 animate-pulse">
                <div className="flex items-center gap-2 mb-1 text-[11px] text-blue-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                  {userName} is speaking...
                </div>
                <p className="text-xs leading-relaxed pl-4 italic text-gray-200">
                  "{interimText}"
                </p>
              </div>
            )}

            {/* Assistant Thinking Indicator */}
            {isAssistantThinking && (
              <div className="rounded-xl p-3 bg-purple-950/40 border border-purple-500/40 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-purple-300 font-medium">
                  Maya is thinking with Gemini AI...
                </span>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </>
        )}
      </div>

      {/* Interactive Query Input Box */}
      <div className="p-3 border-t border-gray-700/80 bg-gray-850">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (userQuery.trim()) {
              askAssistant(userQuery);
              setUserQuery("");
            }
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Ask Maya (or say 'Hey Assistant')..."
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            disabled={isAssistantThinking}
            className="flex-1 px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
          />
          <button
            type="submit"
            disabled={!userQuery.trim() || isAssistantThinking}
            className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:from-purple-800 active:to-indigo-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 shadow"
          >
            <span>Ask</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
