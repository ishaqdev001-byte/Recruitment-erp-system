/**
 * Document Upload/Download Optimization
 * Improves file transfer speeds and user workflow efficiency
 */

export interface UploadOptions {
  chunkSize?: number;
  maxConcurrent?: number;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  autoRetry?: boolean;
  timeout?: number;
}

export interface DownloadOptions {
  maxConcurrent?: number;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
}

/**
 * Chunked file upload for faster performance
 * Breaks large files into chunks and uploads them in parallel
 */
export class ChunkedUploader {
  private chunkSize: number;
  private maxConcurrent: number;
  private timeout: number;

  constructor(options: UploadOptions = {}) {
    this.chunkSize = options.chunkSize ?? 5 * 1024 * 1024; // 5MB chunks
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.timeout = options.timeout ?? 30000;
  }

  async upload(
    file: File,
    uploadUrl: string,
    options: UploadOptions = {},
  ): Promise<{ success: boolean; uploadId: string }> {
    const totalChunks = Math.ceil(file.size / this.chunkSize);
    const uploadId = `${Date.now()}-${Math.random()}`;
    let uploadedChunks = 0;

    try {
      // Initialize upload on server
      const initResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Id': uploadId,
          'X-File-Size': file.size.toString(),
          'X-File-Name': file.name,
          'X-Total-Chunks': totalChunks.toString(),
        },
        body: JSON.stringify({
          action: 'init',
          fileName: file.name,
          fileSize: file.size,
          totalChunks,
        }),
      });

      if (!initResponse.ok) throw new Error('Upload initialization failed');

      // Upload chunks with concurrency control
      const chunks = this.createChunks(file, totalChunks);
      const results = await this.uploadChunksConcurrently(
        chunks,
        uploadUrl,
        uploadId,
        (progress) => {
          uploadedChunks++;
          const percent = (uploadedChunks / totalChunks) * 100;
          options.onProgress?.(percent);
        },
        options.autoRetry ?? true,
      );

      if (results.some((r) => !r.success)) {
        throw new Error('Some chunks failed to upload');
      }

      // Finalize upload
      const finalizeResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Id': uploadId,
        },
        body: JSON.stringify({
          action: 'finalize',
          uploadId,
        }),
      });

      if (!finalizeResponse.ok) throw new Error('Upload finalization failed');

      return { success: true, uploadId };
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Upload failed');
      options.onError?.(err);
      throw err;
    }
  }

  private createChunks(
    file: File,
    totalChunks: number,
  ): Array<{ data: Blob; index: number }> {
    const chunks: Array<{ data: Blob; index: number }> = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, file.size);
      chunks.push({
        data: file.slice(start, end),
        index: i,
      });
    }
    return chunks;
  }

  private async uploadChunksConcurrently(
    chunks: Array<{ data: Blob; index: number }>,
    uploadUrl: string,
    uploadId: string,
    onChunkProgress: () => void,
    autoRetry: boolean,
  ): Promise<Array<{ success: boolean }>> {
    const results: Array<{ success: boolean }> = [];
    const queue = [...chunks];
    const inProgress = new Set<number>();

    while (queue.length > 0 || inProgress.size > 0) {
      // Start new uploads up to max concurrent
      while (inProgress.size < this.maxConcurrent && queue.length > 0) {
        const chunk = queue.shift();
        if (!chunk) break;

        inProgress.add(chunk.index);

        this.uploadChunk(chunk, uploadUrl, uploadId, autoRetry)
          .then(() => {
            results[chunk.index] = { success: true };
            onChunkProgress();
          })
          .catch(() => {
            results[chunk.index] = { success: false };
            if (autoRetry && queue.length === 0) {
              queue.push(chunk);
            }
          })
          .finally(() => {
            inProgress.delete(chunk.index);
          });
      }

      // Wait for at least one to complete
      if (inProgress.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  private async uploadChunk(
    chunk: { data: Blob; index: number },
    uploadUrl: string,
    uploadId: string,
    autoRetry: boolean,
    attempt = 1,
  ): Promise<void> {
    const formData = new FormData();
    formData.append('chunk', chunk.data);
    formData.append('index', chunk.index.toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'X-Upload-Id': uploadId,
          'X-Chunk-Index': chunk.index.toString(),
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Chunk upload failed: ${response.status}`);
    } catch (error) {
      if (autoRetry && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        return this.uploadChunk(chunk, uploadUrl, uploadId, autoRetry, attempt + 1);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Optimized file download with resume capability
 */
export class OptimizedDownloader {
  private maxConcurrent: number;

  constructor(options: DownloadOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 2;
  }

  async download(
    url: string,
    fileName: string,
    options: DownloadOptions = {},
  ): Promise<void> {
    try {
      // Check if server supports range requests
      const headResponse = await fetch(url, { method: 'HEAD' });
      const supportsRange = headResponse.headers.get('Accept-Ranges') === 'bytes';

      if (supportsRange) {
        await this.parallelDownload(url, fileName, options);
      } else {
        await this.simpleDownload(url, fileName, options);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Download failed');
      options.onError?.(err);
      throw err;
    }
  }

  private async simpleDownload(
    url: string,
    fileName: string,
    options: DownloadOptions,
  ): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;

      if (total > 0) {
        const percent = (loaded / total) * 100;
        options.onProgress?.(percent);
      }
    }

    const blob = new Blob(chunks);
    this.saveFile(blob, fileName);
  }

  private async parallelDownload(
    url: string,
    fileName: string,
    options: DownloadOptions,
  ): Promise<void> {
    const headResponse = await fetch(url, { method: 'HEAD' });
    const fileSize = parseInt(
      headResponse.headers.get('content-length') || '0',
      10,
    );

    if (fileSize === 0) {
      await this.simpleDownload(url, fileName, options);
      return;
    }

    const chunkSize = Math.ceil(fileSize / this.maxConcurrent);
    const chunks: (Uint8Array | null)[] = Array(this.maxConcurrent).fill(null);
    let completedChunks = 0;

    const downloadPromises = Array.from({ length: this.maxConcurrent })
      .map((_, index) => {
        const start = index * chunkSize;
        const end = Math.min(start + chunkSize - 1, fileSize - 1);

        return this.downloadChunk(url, start, end)
          .then((data) => {
            chunks[index] = data;
            completedChunks++;
            const percent = (completedChunks / this.maxConcurrent) * 100;
            options.onProgress?.(percent);
          });
      });

    await Promise.all(downloadPromises);

    // Combine chunks
    const combined = new Uint8Array(fileSize);
    let offset = 0;
    for (const chunk of chunks) {
      if (chunk) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
    }

    const blob = new Blob([combined]);
    this.saveFile(blob, fileName);
  }

  private async downloadChunk(
    url: string,
    start: number,
    end: number,
  ): Promise<Uint8Array> {
    const response = await fetch(url, {
      headers: {
        Range: `bytes=${start}-${end}`,
      },
    });

    if (!response.ok) throw new Error(`Chunk download failed: ${response.status}`);

    return new Uint8Array(await response.arrayBuffer());
  }

  private saveFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Local caching for frequently downloaded documents
 */
export class DocumentCache {
  private cache = new Map<string, { data: Blob; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs: number = 1 * 60 * 60 * 1000) {
    // 1 hour default
    this.ttl = ttlMs;
  }

  set(key: string, data: Blob): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string): Blob | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  remove(key: string): void {
    this.cache.delete(key);
  }
}

/**
 * Automatic save/sync manager for workflow efficiency
 */
export class WorkflowAutoSave {
  private saveQueue: Array<{ data: any; callback: () => Promise<void> }> = [];
  private isSaving = false;
  private saveInterval: NodeJS.Timeout | null = null;
  private lastSaveTime = 0;
  private debounceDelay: number;

  constructor(debounceDelayMs: number = 1000) {
    this.debounceDelay = debounceDelayMs;
  }

  /**
   * Queue data for automatic save
   */
  queueSave(data: any, callback: () => Promise<void>): void {
    this.saveQueue.push({ data, callback });
    this.scheduleSave();
  }

  /**
   * Manual save trigger
   */
  async save(callback: () => Promise<void>): Promise<void> {
    if (this.isSaving) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isSaving) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });
    }

    this.isSaving = true;
    try {
      await callback();
      this.lastSaveTime = Date.now();
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Process all queued saves
   */
  private async processSaveQueue(): Promise<void> {
    if (this.saveQueue.length === 0) return;
    if (this.isSaving) return;

    this.isSaving = true;
    try {
      const queue = [...this.saveQueue];
      this.saveQueue = [];

      // Execute all saves in parallel
      await Promise.all(queue.map((item) => item.callback()));

      this.lastSaveTime = Date.now();
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Schedule save with debouncing
   */
  private scheduleSave(): void {
    if (this.saveInterval) {
      clearTimeout(this.saveInterval);
    }

    const timeSinceLastSave = Date.now() - this.lastSaveTime;
    const delay = Math.max(0, this.debounceDelay - timeSinceLastSave);

    this.saveInterval = setTimeout(() => {
      this.processSaveQueue();
    }, delay);
  }

  /**
   * Immediate save and clear queue
   */
  async flush(): Promise<void> {
    if (this.saveInterval) {
      clearTimeout(this.saveInterval);
      this.saveInterval = null;
    }
    await this.processSaveQueue();
  }

  /**
   * Get current save status
   */
  getStatus(): { isSaving: boolean; queueLength: number } {
    return {
      isSaving: this.isSaving,
      queueLength: this.saveQueue.length,
    };
  }
}

/**
 * Request deduplication for identical concurrent requests
 */
export class RequestDeduplicator {
  private pendingRequests = new Map<string, Promise<any>>();

  async deduplicate<T>(
    key: string,
    request: () => Promise<T>,
  ): Promise<T> {
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!;
    }

    const promise = request()
      .finally(() => {
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  clear(): void {
    this.pendingRequests.clear();
  }
}

/**
 * Bandwidth estimation and adaptive quality
 */
export class AdaptiveDownload {
  private bandwidthEstimate = 5 * 1024 * 1024; // 5Mbps default

  async estimateBandwidth(): Promise<number> {
    try {
      const testSize = 1024 * 1024; // 1MB test file
      const start = performance.now();

      const response = await fetch('/api/test-bandwidth', {
        method: 'HEAD',
      });

      if (!response.ok) return this.bandwidthEstimate;

      const duration = (performance.now() - start) / 1000;
      const bandwidth = testSize / duration;

      this.bandwidthEstimate = bandwidth;
      return bandwidth;
    } catch {
      return this.bandwidthEstimate;
    }
  }

  shouldUseChunkedUpload(fileSize: number): boolean {
    // Use chunks for files > 10MB or if bandwidth is low
    return fileSize > 10 * 1024 * 1024 || this.bandwidthEstimate < 2 * 1024 * 1024;
  }

  getOptimalChunkSize(): number {
    // Adapt chunk size based on bandwidth
    if (this.bandwidthEstimate < 1 * 1024 * 1024) {
      return 1 * 1024 * 1024; // 1MB
    } else if (this.bandwidthEstimate < 5 * 1024 * 1024) {
      return 3 * 1024 * 1024; // 3MB
    } else {
      return 10 * 1024 * 1024; // 10MB
    }
  }
}

/**
 * Service worker-based background download/upload
 */
export async function registerBackgroundSync(fileId: string, action: 'download' | 'upload'): Promise<void> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register(`${action}-${fileId}`);
    } catch (error) {
      console.warn('Background sync registration failed:', error);
    }
  }
}
