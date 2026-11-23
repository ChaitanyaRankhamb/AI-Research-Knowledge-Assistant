import mongoose, { ConnectOptions } from "mongoose";
import dotenv from "dotenv";
import { AppError } from "../Error/appError";

// choose which mongo db has to use. Atlas or image. 
dotenv.config({
  path:
    process.env.NODE_ENV === "production" ? ".env.production" : ".env",
});

const MONGO_URI = process.env.MONGODB_URI!;

if (!MONGO_URI) {
  throw new AppError(
    "MONGODB_URI is not defined in environment variables",
    500,
  );
}

// Cache connection (important for Next.js / Node apps)
let isConnected = false;

// Connection options for High Availability & Zero Data Loss across Replica Set
const mongooseOptions: ConnectOptions = {
  // Durability & Consensus
  w: "majority",
  journal: true,
  retryWrites: true,
  retryReads: true,
  readPreference: "primary",

  // Connection Pool & Resiliency
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
  socketTimeoutMS: 45000,
};

// Event listeners to monitor Replica Set state transitions & failovers
mongoose.connection.on("connected", () => {
  console.log("[MongoDB] Connection established to replica set.");
});

mongoose.connection.on("error", (err) => {
  console.error("[MongoDB] Connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("[MongoDB] Disconnected from replica set. Automatic reconnection in progress...");
});

mongoose.connection.on("reconnected", () => {
  console.log("[MongoDB] Successfully reconnected to replica set.");
});

const connectDB = async () => {
  if (isConnected) {
    console.log("Using existing DB connection");
    return;
  }

  try {
    const conn = await mongoose.connect(MONGO_URI, mongooseOptions);

    isConnected = conn.connections[0].readyState === 1;

    console.log("MongoDB Connected Successfully to Replica Set");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    process.exit(1);
  }
};

export default connectDB;
