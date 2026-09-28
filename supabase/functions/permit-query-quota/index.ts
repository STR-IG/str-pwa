import { servePermit } from '../_shared/permit-quota.ts';
servePermit(async () => new Response('{}'), true);
