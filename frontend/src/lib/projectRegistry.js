/** AXE CORE project/capability registry client. */
import { api } from "./api";

export async function getRegistry() {
  const res = await api.get("/project-registry");
  return res.data;
}

export async function listProjects() {
  const res = await api.get("/project-registry/projects");
  return res.data;
}

export async function listCapabilities(projectId = null, category = null) {
  const params = {};
  if (projectId) params.project_id = projectId;
  if (category) params.category = category;
  const res = await api.get("/project-registry/capabilities", { params });
  return res.data;
}

export async function getCapability(capabilityId) {
  const res = await api.get(`/project-registry/capabilities/${capabilityId}`);
  return res.data;
}
