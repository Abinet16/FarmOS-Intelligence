import { WEB_ORIGIN } from './test-env.js';
import type { signUp } from './app.js';

export type Agent = Awaited<ReturnType<typeof signUp>>['agent'];

export const send = (
  agent: Agent,
  method: 'post' | 'patch' | 'put',
  url: string,
  body: object = {},
) => agent[method](url).set('Origin', WEB_ORIGIN).send(body);

/**
 * An organization owned by `owner`, with a farm, a house and an active flock
 * (layers unless stated) of 1,000 birds placed on 1 Oct 2026. Returns the API base path and ids.
 */
export async function createFarmWithFlock(
  owner: Agent,
  name: string,
  purpose: 'LAYER' | 'BROILER' | 'BREEDER' = 'LAYER',
) {
  const org = (await send(owner, 'post', '/api/v1/organizations', { name }).expect(201)).body.id;
  const base = `/api/v1/organizations/${org}`;
  const farmId = (await send(owner, 'post', `${base}/farms`, { name: `${name} farm` }).expect(201))
    .body.id;
  const houseId = (
    await send(owner, 'post', `${base}/houses`, { farmId, name: 'H1', capacity: 5000 }).expect(201)
  ).body.id;
  const batchId = (
    await send(owner, 'post', `${base}/flock-batches`, {
      houseId,
      batchCode: `${name.slice(0, 3).toUpperCase()}-01`,
      breed: 'Lohmann Brown',
      purpose,
      placementDate: '2026-10-01',
      initialBirds: 1000,
    }).expect(201)
  ).body.id;
  await send(owner, 'post', `${base}/flock-batches/${batchId}/status`, {
    status: 'ACTIVE',
  }).expect(200);
  return { org, base, farmId, houseId, batchId };
}

/** Adds an existing user to the organization with a role; returns the membership id. */
export async function addMember(owner: Agent, base: string, email: string, role: string) {
  const response = await send(owner, 'post', `${base}/members`, { email, role }).expect(201);
  return response.body.id as string;
}
