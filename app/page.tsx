"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const [username, setUsername] = useState("");
  const router = useRouter();

  const handleJoin = () => {
    const name = username.trim() === "" ? "Anonymous" : username.trim();
    const meetingId = process.env.NEXT_PUBLIC_CALL_ID || "demo-call";
    router.push(`/meeting/${meetingId}?name=${encodeURIComponent(name)}`);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="p-8 bg-gray-800 rounded-2xl border border-gray-700 w-80 shadow-2xl">
        <h2 className="text-xl font-semibold mb-4 text-center">Enter Your Name</h2>
        <input
          placeholder="e.g. Aman (Optional)"
          className="px-4 py-3 w-full rounded-lg bg-gray-700/80 border border-gray-600 text-white outline-none focus:ring-2 focus:ring-blue-500"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
        />
        <button
          onClick={handleJoin}
          className="mt-5 w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg font-medium transition cursor-pointer"
        >
          Join Meeting
        </button>
      </div>
    </div>
  );
}

