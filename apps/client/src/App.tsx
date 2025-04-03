
import { Uncached } from '@uncached/core';
import { makeBuffer } from './utils/buffer';
import { useEffect, useRef } from 'react';
import { Compression } from '@uncached/compress-workers';
import worker from "@uncached/compress-workers/worker?url";
import { makeIndexedDbStorageAdapter } from "@uncached/storage-adapter-indexeddb";

function App() {
  const cacheRef = useRef<Uncached | null>(null);
  const compressionRef = useRef<Compression | null>(null);

  async function makeCache() {
    const storageAdapter = await makeIndexedDbStorageAdapter({
      name: "uncached-cache",
      maxStorageSize: 1024 * 1024 * 100, // 100MB
    });
    cacheRef.current = new Uncached({
      defaultTtl: 1000 * 60,
      maxSize: 1024 * 1024 * 10, // 10MB
      hydrate: false,
      blockingStorage: {
        hydrate: false,
        set: false,
        delete: false,
        clear: false,
        cleanup: false,
      },
      fallbackToStorage: true,
      compressInMemory: false,
      compressInStorage: true,
      storageAdapter: storageAdapter,
      compressionAdapter: compressionRef.current!,
    });
  }

  useEffect(() => {
    compressionRef.current = new Compression({
      workers: 16,
      workerUrl: new URL(worker, import.meta.url),
    })
    void makeCache();

    return () => {
      compressionRef.current?.destroy();
      compressionRef.current = null;
      cacheRef.current?.destroy();
      cacheRef.current = null;
    }
  }, []);

  async function onSetClickValue() {
    await cacheRef.current?.set(`click-${Date.now()}`, Date.now(), 1000 * 60)
  }

  async function onMakeLargeBufferClick() {
    const buffer = makeBuffer(1024 * 1024 * 5); // 5mb
    await cacheRef.current?.set(`large-buffer-${Date.now()}`, buffer, 1000 * 60, false, true);
  }

  return (
    <>
      <div className="card">
        <button onClick={onSetClickValue}>
          count
        </button>
        <button onClick={() => void onMakeLargeBufferClick()}>
          count
        </button>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
