import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const SALT = "vorion.custodian.v1"; // fixed: the master key already carries the entropy

/**
 * Envelope encryption for secrets we must store and later use — currently
 * WhatsApp access tokens and app secrets, which the admin pastes into the UI.
 *
 * The master key lives in APP_ENCRYPTION_KEY (env / secrets manager), never
 * in the database, so a stolen database dump alone does not yield working
 * Meta credentials. Rotating the key means re-entering the tokens; that's a
 * deliberate trade for keeping this simple and auditable.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const master = config.get<string>("APP_ENCRYPTION_KEY");
    if (!master || master.length < 16) {
      this.key = null;
      this.logger.warn(
        "APP_ENCRYPTION_KEY is missing or too short — WhatsApp credentials cannot be stored. Set it before configuring WhatsApp.",
      );
    } else {
      this.key = scryptSync(master, SALT, 32);
    }
  }

  get available(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): string {
    if (!this.key) {
      throw new InternalServerErrorException(
        "Server is missing APP_ENCRYPTION_KEY, so secrets cannot be stored. Set it and restart.",
      );
    }
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // iv:tag:ciphertext — GCM tag makes tampering detectable on decrypt.
    return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
  }

  decrypt(payload: string): string {
    if (!this.key) throw new InternalServerErrorException("Server is missing APP_ENCRYPTION_KEY");
    const [ivB64, tagB64, dataB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !dataB64) throw new InternalServerErrorException("Malformed secret");

    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  /** For showing an admin which token is configured without revealing it. */
  static mask(secret: string): string {
    if (secret.length <= 8) return "••••";
    return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
  }
}
