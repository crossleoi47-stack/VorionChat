import { Global, Module } from "@nestjs/common";
import { STORAGE_PROVIDER } from "./storage-provider.interface";
import { LocalDiskStorageProvider } from "./providers/local-disk-storage.provider";

@Global()
@Module({
  providers: [LocalDiskStorageProvider, { provide: STORAGE_PROVIDER, useExisting: LocalDiskStorageProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
