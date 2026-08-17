import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createConversation, getConversation, listMessages, sendMessage } from "../../conversation/conversation-service.js";
import { db, unwrap } from "../../db/insforge-client.js";

const CreateConversationBody = z.object({ title: z.string().optional(), requirementId: z.string().uuid().optional() });
const SendMessageBody = z.object({ text: z.string().min(1) });

export default async function conversationsRoutes(app: FastifyInstance) {
  app.post("/conversations", async (req, reply) => {
    const body = CreateConversationBody.parse(req.body ?? {});
    const conversation = await createConversation(req.userId, body.title, body.requirementId);
    reply.code(201);
    return conversation;
  });

  app.get("/conversations/:id", async (req) => {
    const { id } = req.params as { id: string };
    const conversation = await getConversation(id);
    const messages = conversation ? await listMessages(id) : [];
    // El link a "ver estimación completa" no debe vivir solo en el estado del chat en el
    // navegador — si el usuario recarga la página o vuelve más tarde, se pierde. Devolver
    // el/los estimateId ya persistidos de esta conversación para que la UI lo reconstruya.
    const estimates = conversation
      ? await unwrap<{ id: string }[]>(
          "select:project_estimates:by_conversation",
          db.from("project_estimates").select("id").eq("conversation_id", id).order("created_at", { ascending: false })
        )
      : [];
    return { conversation, messages, estimateIds: estimates.map((e) => e.id) };
  });

  app.post("/conversations/:id/messages", async (req) => {
    const { id } = req.params as { id: string };
    const body = SendMessageBody.parse(req.body);
    return sendMessage(id, body.text);
  });
}
