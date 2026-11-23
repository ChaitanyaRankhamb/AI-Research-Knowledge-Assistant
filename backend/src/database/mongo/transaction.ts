import mongoose, { ClientSession } from "mongoose";
import type { TransactionOptions } from "mongodb";

const transactionOptions: TransactionOptions = {
  readPreference: "primary",
  readConcern: { level: "majority" },
  writeConcern: { w: "majority", j: true },
};

/**
 * Executes a callback within a MongoDB multi-document transaction.
 *
 * If the callback succeeds, changes are atomically committed across the replica set.
 * If an error is thrown, all changes are automatically aborted (rolled back).
 * Transient transaction errors (such as write conflicts) are retried by Mongoose.
 *
 * @param work Function containing database operations to execute within the transaction
 * @returns The result returned by the work callback
 */
export async function runInTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(session);
    }, transactionOptions);
    return result!;
  } finally {
    await session.endSession();
  }
}
