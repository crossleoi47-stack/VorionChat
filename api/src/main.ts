import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  // eslint-disable-next-line no-console
  console.log("========================================");
  // eslint-disable-next-line no-console
  console.log("        VORION CHAT API");
  // eslint-disable-next-line no-console
  console.log("========================================");

  // rawBody: true lets the WhatsApp webhook controller verify Meta's
  // X-Hub-Signature-256 against the exact bytes received (signature.util.ts).
  const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix("api");

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("[SERVER]");
  // eslint-disable-next-line no-console
  console.log(`API: http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log("Status: RUNNING");
  // eslint-disable-next-line no-console
  console.log("========================================");
}

bootstrap();
