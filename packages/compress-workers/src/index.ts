import { generateId } from "./utils/id";
import { chunkString } from "./utils/chunk";

export interface CompressionOptions {
  workers?: number | false;
  workerUrl?: URL;
}

type WorkerId = string;

type PipelineId = string;

type JobId = string;

interface Job {
  pipelineId: PipelineId;
  jobId: JobId;
  index: number;
  type: "compress" | "decompress";
  data: string;
}

interface JobPromise {
  jobId: JobId;
  pipelineId: PipelineId;
  index: number;
  resolve: (data: string) => void;
  reject: (error: Error) => void;
}

interface WorkerElement {
  worker: Worker;
  processingJob: JobId | null;
}

export interface MessageToWorker {
  workerId: WorkerId;
  job: Job;
}

export interface MessageFromWorker {
  workerId: WorkerId;
  job: Job;
}

export class Compression {
  #useWorkers: boolean;
  #workerCount: number;
  #workers: Map<string, WorkerElement>;
  #queue: Job[];
  #promises: JobPromise[];
  #workerUrl: URL;
  #stopQueue: boolean;

  constructor(options: CompressionOptions | undefined) {
    this.#useWorkers = options?.workers !== false;
    this.#workerCount = options?.workers === false ? 0 : options?.workers ?? 0;
    this.#workers = new Map<string, WorkerElement>();
    this.#queue = [];
    this.#promises = [];
    this.#workerUrl =
      options?.workerUrl ?? new URL("./worker.ts", import.meta.url);
    this.#stopQueue = false;
    this.#init();
    this.#workQueue();
  }

  #init = () => {
    if (this.#useWorkers) {
      if (
        typeof window !== "undefined" &&
        window.Worker &&
        typeof Worker !== "undefined"
      ) {
        for (let i = 0; i < this.#workerCount; i++) {
          const worker = new Worker(this.#workerUrl, { type: "module" });
          worker.onmessage = this.#onWorkerMessage;
          this.#workers.set(generateId(), { worker, processingJob: null });
        }
      } else {
        console.error(
          "Compression: Workers are not supported in this environment"
        );
      }
    }
  };

  destroy = () => {
    this.#stopQueue = true;
    this.#workers.forEach((w) => {
      w.worker.terminate();
    });
    this.#workers.clear();
    this.#queue = [];
  };

  #sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  #workQueue = async (): Promise<void> => {
    await this.#sleep(10);
    if (this.#stopQueue) return;
    if (this.#queue.length === 0) return this.#workQueue();
    const job = this.#queue[0];
    if (!job) return this.#workQueue();

    const worker = Array.from(this.#workers.keys())
      .map((k) => {
        const w = this.#workers.get(k);
        if (!w) return undefined;
        return {
          id: k,
          processingJob: w.processingJob,
          worker: w.worker,
        };
      })
      .filter((w) => w !== undefined)
      .find((worker) => {
        return !worker.processingJob;
      });
    if (!worker) {
      return this.#workQueue();
    }
    const message: MessageToWorker = {
      workerId: worker.id,
      job,
    };
    const { worker: workerInstance } = worker;
    workerInstance.postMessage(message);
    this.#queue.shift();
    return this.#workQueue();
  };

  compress = async (data: string) => {
    console.log("Compressing");
    const startTime = performance.now();
    const pipelineId = generateId();
    const chunkedData = chunkString(data, this.#workerCount);
    console.log("Chunked data", chunkedData);
    let i: number = 0;
    const promises: Promise<string>[] = [];
    for (const chunk of chunkedData) {
      promises.push(
        new Promise((resolve, reject) => {
          this.#addJob(pipelineId, i, chunk, resolve, reject, "compress");
        })
      );
      i++;
    }

    const chunkedResults = await Promise.all(promises);
    let result: string = "";
    chunkedResults.forEach((val) => {
      result += val;
    });
    const endTime = performance.now();
    console.log(`Compressing took ${endTime - startTime}ms`);
    return result;
  };

  decompress = async (data: string) => {
    console.log("Decompressing");
    const startTime = performance.now();
    const pipelineId = generateId();
    const chunkedData = chunkString(data, this.#workerCount);
    let i: number = 0;
    const promises: Promise<string>[] = [];
    for (const chunk of chunkedData) {
      promises.push(
        new Promise((resolve, reject) => {
          this.#addJob(pipelineId, i, chunk, resolve, reject, "decompress");
        })
      );
      i++;
    }

    const chunkedResults = await Promise.all(promises);
    let result: string = "";
    chunkedResults.forEach((val) => {
      result += val;
    });
    const endTime = performance.now();
    console.log(`Decompressing took ${endTime - startTime}ms`);
    return result;
  };

  #addJob = (
    pipelineId: PipelineId,
    index: number,
    data: string,
    resolve: any,
    reject: any,
    type: "compress" | "decompress"
  ) => {
    const jobId = generateId();
    this.#queue.push({
      pipelineId,
      jobId,
      data,
      type,
      index,
    });
    this.#promises.push({
      jobId,
      pipelineId,
      index,
      resolve,
      reject,
    });
    return jobId;
  };

  #onWorkerMessage = (event: MessageEvent<MessageFromWorker>) => {
    const message = event.data;
    const job = this.#promises.find(
      (j) =>
        j.jobId === message.job.jobId && j.pipelineId === message.job.pipelineId
    );
    if (!job) {
      console.error("Job not found");
      return;
    }
    job.resolve(message.job.data);
    const worker = this.#workers.get(message.workerId);
    if (worker) {
      worker.processingJob = null;
    }
  };
}
