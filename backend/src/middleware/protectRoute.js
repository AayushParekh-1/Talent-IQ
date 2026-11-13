import { requireAuth } from "@clerk/express";
import User from "../models/User.js";
import { ENV } from "../lib/env.js";

let benchUserCache = null;

const benchProtectRoute = async (req, res, next) => {
  try {
    if (!benchUserCache) {
      benchUserCache = (await User.findOne({ clerkId: "bench_user_0" })) || (await User.findOne());
    }
    if (!benchUserCache) {
      return res.status(404).json({ message: "Bench user not found. Please run seed script first." });
    }
    req.user = benchUserCache;
    next();
  } catch (error) {
    console.error("Error in benchProtectRoute", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const protectRoute = ENV.BENCH_MODE
  ? [benchProtectRoute]
  : [
      requireAuth(),
      async (req, res, next) => {
        try {
          const clerkId = req.auth().userId;

          if (!clerkId) return res.status(401).json({ message: "Unauthorized - invalid token" });

          // find user in db by clerk ID
          const user = await User.findOne({ clerkId });

          if (!user) return res.status(404).json({ message: "User not found" });

          // attach user to req
          req.user = user;

          next();
        } catch (error) {
          console.error("Error in protectRoute middleware", error);
          res.status(500).json({ message: "Internal Server Error" });
        }
      },
    ];
