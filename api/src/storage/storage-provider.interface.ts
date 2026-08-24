export interface StoredFile {
  storageKey: string;
}

/**
 * Where message attachments actually live. LocalDiskStorageProvider is the
 * only implementation today — swap in an S3-compatible provider before
 * production the same way WhatsappProvider swaps mock for Meta (blueprint
 * §15/§17): implement this interface, wire it in storage.module.ts.
 */
export interface StorageProvider {
  save(buffer: Buffer, opts: { extension: string }): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
}

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");
