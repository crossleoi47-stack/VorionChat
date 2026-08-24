import { ForbiddenException } from "@nestjs/common";
import { MessagesService } from "./messages.service";

/**
 * Regression guard for the failure mode that would be silent: someone
 * refactors a service and drops the `assertFeature` / `screenOutgoing` call.
 * Nothing would look broken — the feature switches and DLP would simply stop
 * being enforced. These tests assert the guards are actually invoked on the
 * paths that matter, and that a refusal stops the work before anything is
 * persisted or sent.
 */
describe("MessagesService — policy enforcement is wired in", () => {
  const conversationId = "conv-1";
  const user = { id: "u1", companyId: "c1", role: "EMPLOYEE" as const, sessionId: "s1" };

  let policy: { assertFeature: jest.Mock; screenOutgoing: jest.Mock };
  let prisma: any;
  let conversations: { assertVisible: jest.Mock };
  let whatsapp: { sendOutbound: jest.Mock };
  let gateway: { broadcastMessage: jest.Mock; broadcast: jest.Mock };
  let service: MessagesService;

  beforeEach(() => {
    policy = {
      assertFeature: jest.fn().mockResolvedValue(undefined),
      screenOutgoing: jest.fn().mockResolvedValue([]),
    };
    conversations = { assertVisible: jest.fn().mockResolvedValue(undefined) };
    whatsapp = { sendOutbound: jest.fn() };
    gateway = { broadcastMessage: jest.fn(), broadcast: jest.fn() };

    const created = {
      id: "m1",
      conversationId,
      senderUserId: user.id,
      senderIsClient: false,
      channel: "INTERNAL",
      type: "TEXT",
      body: "hi",
      createdAt: new Date(),
      editedAt: null,
      deletedForAll: false,
      forwarded: false,
      attachments: [],
      reactions: [],
      stars: [],
      replyTo: null,
      senderUser: { fullName: "Ahmed" },
    };

    prisma = {
      conversation: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: conversationId, type: "INTERNAL" }) },
      message: {
        create: jest.fn().mockResolvedValue(created),
        findUniqueOrThrow: jest.fn().mockResolvedValue(created),
        findUnique: jest.fn().mockResolvedValue(created),
        update: jest.fn().mockResolvedValue(created),
      },
      attachment: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: user.id, fullName: "Ahmed" }) },
    };

    service = new MessagesService(
      prisma,
      conversations as never,
      whatsapp as never,
      gateway as never,
      policy as never,
    );
  });

  const attachment = {
    storageKey: "k",
    mimeType: "image/png",
    sizeBytes: 10,
    checksum: "x",
    originalName: "a.png",
  };

  it("screens every outgoing message body through DLP", async () => {
    await service.send(conversationId, user, { body: "hello there" });
    expect(policy.screenOutgoing).toHaveBeenCalledWith(user, "hello there", conversationId);
  });

  it("requires sendMedia before attaching a photo", async () => {
    await service.send(conversationId, user, { body: "look", type: "IMAGE", attachment });
    expect(policy.assertFeature).toHaveBeenCalledWith(user.id, "sendMedia", expect.any(String));
  });

  it("requires sendVoice — not sendMedia — for a voice note", async () => {
    await service.send(conversationId, user, { type: "VOICE", attachment });
    expect(policy.assertFeature).toHaveBeenCalledWith(user.id, "sendVoice", expect.any(String));
    expect(policy.assertFeature).not.toHaveBeenCalledWith(user.id, "sendMedia", expect.any(String));
  });

  it("requires forwardMessages before forwarding", async () => {
    policy.assertFeature.mockRejectedValueOnce(new ForbiddenException("nope"));
    await expect(service.forward("m1", user, "conv-2")).rejects.toBeInstanceOf(ForbiddenException);
    expect(policy.assertFeature).toHaveBeenCalledWith(user.id, "forwardMessages", expect.any(String));
  });

  it("does not persist a message when the feature switch refuses", async () => {
    policy.assertFeature.mockRejectedValueOnce(new ForbiddenException("disabled"));
    await expect(
      service.send(conversationId, user, { type: "IMAGE", attachment }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("does not persist or send when DLP blocks the message", async () => {
    policy.screenOutgoing.mockRejectedValueOnce(new ForbiddenException("blocked"));
    await expect(
      service.send(conversationId, user, { body: "call me on 0509876543" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(whatsapp.sendOutbound).not.toHaveBeenCalled();
  });

  it("checks policy before it checks anything else about the conversation", async () => {
    // Ordering matters: a blocked message must not even be broadcast.
    policy.screenOutgoing.mockRejectedValueOnce(new ForbiddenException("blocked"));
    await expect(service.send(conversationId, user, { body: "x" })).rejects.toThrow();
    expect(gateway.broadcastMessage).not.toHaveBeenCalled();
  });
});
