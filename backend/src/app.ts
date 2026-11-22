import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import researchQueryRouter from "./modules/research-query/route";
import { parseApiError } from "./utils/api-error-handler";
import { failureResponse } from "./utils/api-response";
import userRouter from "./modules/user/user.routes";
import verifyRouter from "./modules/verify/verify.route";
import checkUsernameRouter from "./modules/checkUsername/checkUsername.route";
import { redisConnection } from "./config/redis.connection";
import connectDB from "./config/mongo.connection";
import cors from "cors";
import passport from "./config/passport.config";
import { errorHandler } from "./middlewares/errorHandling.middleware";
import { initializeMinio } from "./config/minio.config";
import researchSessionNameRouter from "./modules/research-session-name/route";
import researchSessionRouter from "./modules/research-session/research-session.route";


const app = express();

// connect the mongoDB database
await connectDB();

// connect the redis client here
await redisConnection();

// Initialize Minio
await initializeMinio();

// connect the frontend with backend using cors middleware
const frontendOrigin = process.env.FRONTEND_URL
  ? new URL(process.env.FRONTEND_URL).origin
  : undefined;
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    frontendOrigin,
  ].filter((origin): origin is string => Boolean(origin)),
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true, // allow cookies/auth headers
};

app.use(cors(corsOptions)); // connect with cors

app.use((req, res, next) => {
  console.log("REQUEST RECEIVED:", req.method, req.url);
  next();
});

app.use(cookieParser());

app.use(express.json({ limit: "10mb" })); // to enable large text
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // to enable large text 
app.use(passport.initialize()); // initialize the passport middleware


app.get("/", (req, res) => {
  res.send("Hello, from AI Research & Knowledge Assistant!");
});

// Routes
app.use("/auth", userRouter);
app.use("/verify", verifyRouter);
app.use("/check-username", checkUsernameRouter);
app.use("/api", researchQueryRouter);
app.use("/api", researchSessionNameRouter);
app.use("/api/research-sessions", researchSessionRouter);

// Global fallback error-handling middleware
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  const parsed = parseApiError(err, "ExpressGlobalErrorHandler");
  console.error("\n[Express Global Error Handler]:", {
    method: req.method,
    url: req.url,
    service: parsed.service,
    statusCode: parsed.statusCode,
    message: parsed.message,
    stack: err instanceof Error ? err.stack : undefined,
  });

  return failureResponse(res, parsed.message, parsed.statusCode, {
    service: parsed.service,
    statusCode: parsed.statusCode,
    isRateLimit: parsed.isRateLimit,
    details: parsed.details || (err instanceof Error ? err.message : String(err)),
  });
});

// use the error handling middleware
app.use(errorHandler);

const server = app.listen(8000, () => {
  console.log("Server is running on port 8000");
});

// Configure socket timeouts to prevent premature ECONNRESET / socket hang up during LLM synthesis
server.setTimeout(300000); // 5 minutes
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Prevent asynchronous stream disconnects or unhandled rejections from crashing the process
process.on("unhandledRejection", (reason: unknown) => {
  console.error("[Process] Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error: Error) => {
  console.error("[Process] Uncaught Exception:", error);
});

export default app;
