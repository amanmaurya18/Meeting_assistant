import { StreamClient } from "@stream-io/node-sdk";

export async function POST(request) {
  try {
    const { userId } = await request.json();

    const apiKey = process.env.STREAM_API_KEY || process.env.NEXT_PUBLIC_STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;

    if (!apiKey || !apiSecret) {
      return Response.json(
        { error: "Missing Stream API credentials (STREAM_API_KEY or STREAM_API_SECRET not set in environment)" },
        { status: 500 }
      );
    }

    const serverClient = new StreamClient(apiKey, apiSecret, { timeout: 15000 });

    // Create/upsert the user first
    const newUser = {
      id: userId,
      role: "admin",
      name: userId,
    };
    await serverClient.upsertUsers([newUser]);

    // Generate token valid for 24 hours
    const validity = 24 * 60 * 60;
    const token = serverClient.generateUserToken({
      user_id: userId,
      validity_in_seconds: validity,
    });

    return Response.json({ token });
  } catch (error) {
    console.error("Token generation error:", error);
    return Response.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}