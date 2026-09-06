export async function POST(request) {
  try {
    const { question, transcripts } = await request.json();

    if (!question) {
      return Response.json({ error: "Question is required" }, { status: 400 });
    }

    const transcriptList = Array.isArray(transcripts) ? transcripts : [];
    const transcriptContext = transcriptList
      .map((t) => `[${t.speaker || "Participant"}]: ${t.text}`)
      .join("\n");

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (apiKey) {
      const systemInstruction = `You are Maya, an articulate and fast female executive meeting assistant.
Answer concisely, directly, and factually based on the meeting transcript.
- Use clear bullet points and bold headers.
- If asked for action items, list owners and timeframes.
- Keep the response direct and avoid filler intros.`;

      const prompt = `MEETING TRANSCRIPT:
${transcriptContext || "(No transcript entries recorded yet)"}

QUESTION:
${question}

Answer as Maya:`;

      const models = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];

      for (const model of models) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              signal: controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
                  maxOutputTokens: 500,
                  temperature: 0.3,
                },
              }),
            }
          );
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const answer =
              data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (answer) {
              return Response.json({ answer, source: `gemini (${model})` });
            }
          }
        } catch (err) {
          // Timeout or model busy, try next model or fallback
          console.warn(`Model ${model} notice:`, err.name === "AbortError" ? "Timeout (12s)" : err.message);
        }
      }
    }

    // Fast, intelligent context fallback if AI takes too long or no key
    const lowerQ = question.toLowerCase();
    let answer = "";

    if (lowerQ.includes("action item") || lowerQ.includes("task") || lowerQ.includes("to do") || lowerQ.includes("todo")) {
      const actionPhrases = ["will", "need to", "have to", "action", "task", "assigned", "todo", "follow up", "deadline", "by tomorrow", "working on", "should"];
      const actionItems = [];

      transcriptList.forEach((t) => {
        const sentences = t.text.split(/[.?!]+/).filter(Boolean);
        sentences.forEach((s) => {
          if (actionPhrases.some((phrase) => s.toLowerCase().includes(phrase))) {
            actionItems.push(`**${t.speaker}**: ${s.trim()}`);
          }
        });
      });

      if (actionItems.length > 0) {
        answer = "Here are the identified action items:\n• " + actionItems.join("\n• ");
      } else {
        answer = "No specific action items detected yet in the meeting discussions.";
      }
    } else if (lowerQ.includes("summar") || lowerQ.includes("overview") || lowerQ.includes("recap")) {
      if (transcriptList.length === 0) {
        answer = "The meeting has just begun and there are no transcript entries yet to summarize.";
      } else {
        const speakers = [...new Set(transcriptList.map((t) => t.speaker))];
        const lastFew = transcriptList.slice(-5).map((t) => `• **${t.speaker}**: "${t.text}"`).join("\n");
        answer = `Meeting Summary (${transcriptList.length} notes):\nActive participants: ${speakers.join(", ")}\n\nRecent discussions:\n${lastFew}`;
      }
    } else {
      const matched = transcriptList.filter((t) => {
        const words = question.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3);
        return words.some((w) => t.text.toLowerCase().includes(w));
      });

      if (matched.length > 0) {
        answer = `Relevant notes from discussion:\n` + matched.map((m) => `• [${m.speaker}]: "${m.text}"`).join("\n");
      } else if (transcriptList.length > 0) {
        answer = `I didn't hear a direct mention of "${question}" in recent statements. Recent topics: ` +
          transcriptList.slice(-3).map((t) => `"${t.text}"`).join("; ");
      } else {
        answer = "I'm listening! Ask me to summarize, list action items, or answer questions as you discuss.";
      }
    }

    return Response.json({ answer, source: "fast-analyzer" });
  } catch (err) {
    console.error("Assistant error:", err);
    return Response.json({ error: "Failed to process request" }, { status: 500 });
  }
}
