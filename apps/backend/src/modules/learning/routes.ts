import type { FastifyInstance } from "fastify";
import { db, unwrap, unwrapNullable } from "../../db/insforge-client.js";
import type { LearningProposalRow } from "../../db/types.js";
import { runLearningCycle } from "../../learning-agent/index.js";
import { approveProposal, activateProposal } from "../../learning-agent/proposal-state-machine.js";

export default async function learningRoutes(app: FastifyInstance) {
  app.post("/learning/run", async () => runLearningCycle());

  app.get("/learning/proposals", async (req) => {
    const query = req.query as { status?: string };
    let builder = db.from("learning_proposals").select().order("created_at", { ascending: false });
    if (query.status) builder = builder.eq("status", query.status);
    return unwrap<LearningProposalRow[]>("select:learning_proposals", builder);
  });

  app.get("/learning/proposals/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const proposal = await unwrapNullable<LearningProposalRow | null>(
      "select:learning_proposals:one",
      db.from("learning_proposals").select().eq("id", id).maybeSingle()
    );
    if (!proposal) {
      reply.code(404);
      return { error: "Propuesta no encontrada" };
    }
    return proposal;
  });

  app.post("/learning/proposals/:id/approve", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const proposal = await approveProposal(id, req.userId);
      return proposal;
    } catch (err) {
      reply.code(409);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/learning/proposals/:id/activate", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await activateProposal(id, req.userId);
      return result;
    } catch (err) {
      reply.code(409);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
