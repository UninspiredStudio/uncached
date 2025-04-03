import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import type { MessageToWorker, MessageFromWorker } from ".";

console.log("Worker loaded");

self.onmessage = (event: MessageEvent<MessageToWorker>) => {
  const message = event.data;
  const job = message.job;
  const workerId = message.workerId;
  const func = job.type === "compress" ? compressToUTF16 : decompressFromUTF16;
  const result = func(message.job.data);
  self.postMessage({
    job: {
      ...job,
      data: result,
    },
    workerId,
  } satisfies MessageFromWorker);
};
