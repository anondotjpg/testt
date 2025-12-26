import { getCollection } from "@/lib/mongodb";

export async function getAllAgents() {
  const col = await getCollection('agents');
  return col.find({}).toArray();
}

export async function getAgentById(id) {
  const col = await getCollection('agents');
  return col.findOne({ _id: id });
}

export async function createAgent(agent) {
  const col = await getCollection('agents');
  const result = await col.insertOne({
    ...agent,
    createdAt: new Date()
  });
  return { ...agent, _id: result.insertedId };
}
