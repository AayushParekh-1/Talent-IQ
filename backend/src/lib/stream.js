import { StreamChat } from "stream-chat";
import { StreamClient } from "@stream-io/node-sdk";
import { ENV } from "./env.js";

const apiKey = ENV.STREAM_API_KEY;
const apiSecret = ENV.STREAM_API_SECRET;

if (!ENV.BENCH_MODE && (!apiKey || !apiSecret)) {
  console.error("STREAM_API_KEY or STREAM_API_SECRET is missing");
}

export const chatClient = ENV.BENCH_MODE
  ? {
      channel: () => ({
        create: async () => {},
        addMembers: async () => {},
        delete: async () => {},
      }),
      createToken: () => "bench_token",
      upsertUser: async () => {},
      deleteUser: async () => {},
    }
  : StreamChat.getInstance(apiKey, apiSecret);

export const streamClient = ENV.BENCH_MODE
  ? {
      video: {
        call: () => ({
          getOrCreate: async () => {},
          delete: async () => {},
        }),
      },
    }
  : new StreamClient(apiKey, apiSecret);

export const upsertStreamUser = async (userData) => {
  if (ENV.BENCH_MODE) return;
  try {
    await chatClient.upsertUser(userData);
    console.log("Stream user upserted successfully:", userData);
  } catch (error) {
    console.error("Error upserting Stream user:", error);
  }
};

export const deleteStreamUser = async (userId) => {
  if (ENV.BENCH_MODE) return;
  try {
    await chatClient.deleteUser(userId);
    console.log("Stream user deleted successfully:", userId);
  } catch (error) {
    console.error("Error deleting the Stream user:", error);
  }
};
