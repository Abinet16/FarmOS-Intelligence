import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, signUp } from './support/app.js';
import { WEB_ORIGIN } from './support/test-env.js';

type Agent = Awaited<ReturnType<typeof signUp>>['agent'];

/**
 * End-to-end tenant isolation and permission checks through the HTTP API.
 * Alice owns Org A, Bob owns Org B; Bob tries everything he should not be able to.
 */
describe('tenant isolation over HTTP', () => {
  let app: INestApplication;
  let alice: Agent;
  let bob: Agent;
  let bobEmail: string;
  let orgA: string;
  let orgB: string;

  const post = (agent: Agent, url: string) => agent.post(url).set('Origin', WEB_ORIGIN);
  const patch = (agent: Agent, url: string) => agent.patch(url).set('Origin', WEB_ORIGIN);
  const del = (agent: Agent, url: string) => agent.delete(url).set('Origin', WEB_ORIGIN);

  beforeAll(async () => {
    app = await createTestApp();
    ({ agent: alice } = await signUp(app, 'alice'));
    ({ agent: bob, email: bobEmail } = await signUp(app, 'bob'));

    orgA = (await post(alice, '/api/v1/organizations').send({ name: 'Alice Farms' }).expect(201))
      .body.id;
    orgB = (await post(bob, '/api/v1/organizations').send({ name: 'Bob Farms' }).expect(201)).body
      .id;
  });

  afterAll(() => app.close());

  describe('authentication', () => {
    it('rejects anonymous requests', async () => {
      await request(app.getHttpServer()).get('/api/v1/organizations').expect(401);
      await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}`).expect(401);
    });

    it('keeps health checks public', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200);
    });

    it('rejects cookie-authenticated writes from an untrusted origin', async () => {
      await alice
        .post('/api/v1/organizations')
        .set('Origin', 'https://evil.example')
        .send({ name: 'CSRF Farms' })
        .expect(403);
    });
  });

  describe('a non-member', () => {
    it('only sees their own organizations in the list', async () => {
      const { body } = await bob.get('/api/v1/organizations').expect(200);
      expect(body.map((o: { id: string }) => o.id)).toEqual([orgB]);
    });

    it('gets 404, not 403, for another tenant’s organization', async () => {
      await bob.get(`/api/v1/organizations/${orgA}`).expect(404);
      await patch(bob, `/api/v1/organizations/${orgA}`).send({ name: 'Mine now' }).expect(404);
      await bob.get(`/api/v1/organizations/${orgA}/members`).expect(404);
      await bob.get(`/api/v1/organizations/${orgA}/audit-logs`).expect(404);
    });

    it('cannot add themselves to another tenant', async () => {
      await post(bob, `/api/v1/organizations/${orgA}/members`)
        .send({ email: bobEmail, role: 'OWNER' })
        .expect(404);
    });

    it('gets the same 404 for an organization that does not exist', async () => {
      await bob.get('/api/v1/organizations/00000000-0000-4000-8000-000000000000').expect(404);
      await bob.get('/api/v1/organizations/not-a-uuid').expect(404);
    });
  });

  describe('role permissions', () => {
    let bobMembershipInA: string;

    beforeAll(async () => {
      const { body } = await post(alice, `/api/v1/organizations/${orgA}/members`)
        .send({ email: bobEmail, role: 'FIELD_WORKER' })
        .expect(201);
      bobMembershipInA = body.id;
    });

    it('lets a field worker read the organization and its members', async () => {
      await bob.get(`/api/v1/organizations/${orgA}`).expect(200);
      const { body } = await bob.get(`/api/v1/organizations/${orgA}/members`).expect(200);
      expect(body).toHaveLength(2);
    });

    it('forbids a field worker from managing the organization or its access', async () => {
      await patch(bob, `/api/v1/organizations/${orgA}`).send({ name: 'Renamed' }).expect(403);
      await patch(bob, `/api/v1/organizations/${orgA}/members/${bobMembershipInA}`)
        .send({ role: 'OWNER' })
        .expect(403);
      await bob.get(`/api/v1/organizations/${orgA}/audit-logs`).expect(403);
    });

    it('does not let a membership id from one tenant be used in another', async () => {
      await patch(bob, `/api/v1/organizations/${orgB}/members/${bobMembershipInA}`)
        .send({ role: 'AUDITOR' })
        .expect(404);
    });

    it('lets an owner change roles, and audits it', async () => {
      await patch(alice, `/api/v1/organizations/${orgA}/members/${bobMembershipInA}`)
        .send({ role: 'AUDITOR' })
        .expect(200);
      await bob.get(`/api/v1/organizations/${orgA}/audit-logs`).expect(200);

      const { body } = await alice.get(`/api/v1/organizations/${orgA}/audit-logs`).expect(200);
      expect(body.items.map((e: { action: string }) => e.action)).toEqual([
        'membership.role_changed',
        'membership.created',
        'organization.created',
      ]);
    });

    it('never leaves an organization without an owner', async () => {
      const { body: members } = await alice
        .get(`/api/v1/organizations/${orgA}/members`)
        .expect(200);
      const aliceMembership = members.find((m: { role: string }) => m.role === 'OWNER');
      await del(alice, `/api/v1/organizations/${orgA}/members/${aliceMembership.id}`).expect(409);
      await patch(alice, `/api/v1/organizations/${orgA}/members/${aliceMembership.id}`)
        .send({ role: 'MANAGER' })
        .expect(409);
    });

    it('removes access immediately when a member is removed', async () => {
      await del(alice, `/api/v1/organizations/${orgA}/members/${bobMembershipInA}`).expect(204);
      await bob.get(`/api/v1/organizations/${orgA}`).expect(404);
    });
  });

  describe('validation', () => {
    it('rejects malformed input with a field-level message', async () => {
      const { body } = await post(alice, '/api/v1/organizations')
        .send({ name: 'x', timezone: 'Mars/Base' })
        .expect(400);
      expect(body.issues.map((i: { path: string }) => i.path).sort()).toEqual(['name', 'timezone']);
    });

    it('returns 409 for a duplicate slug', async () => {
      await post(alice, '/api/v1/organizations')
        .send({ name: 'Slug One', slug: 'taken-slug' })
        .expect(201);
      await post(bob, '/api/v1/organizations')
        .send({ name: 'Slug Two', slug: 'taken-slug' })
        .expect(409);
    });
  });
});
