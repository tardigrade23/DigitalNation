// Digital Nation reminders as Web Push notifications.
//   POST {}                -> send due reminders (pg_cron calls this every 5 minutes, see migration 20261107100000)
//   POST {"action":"key"}  -> the VAPID public key the game subscribes with
// The VAPID key pair is derived from the project's service role key, which only
// the server knows, so there is no extra secret to store. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createECDH, createHmac } from 'node:crypto';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY);

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ecdh = createECDH('prime256v1');
ecdh.setPrivateKey(createHmac('sha256', SERVICE_KEY).update('digitalnation-vapid-v1').digest());
const VAPID_PUBLIC = b64url(ecdh.getPublicKey());
webpush.setVapidDetails('https://tardigrade23.github.io/DigitalNation/', VAPID_PUBLIC, b64url(ecdh.getPrivateKey()));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
});

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({});
  const body = await req.json().catch(() => ({}));
  if (body && body.action === 'key') return json({ publicKey: VAPID_PUBLIC });

  const { data, error } = await supabase.rpc('push_take_due', { p_limit: 500 });
  if (error) return json({ error: error.message }, 500);
  let sent = 0, gone = 0, failed = 0;
  await Promise.all((data || []).map(async (row: { device_id: string; subscription: webpush.PushSubscription; kind: string; title: string; body: string }) => {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({ title: row.title, body: row.body, tag: row.kind }), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404 / 410: the browser dropped the subscription, so forget the device.
      if (status === 404 || status === 410) { gone++; await supabase.rpc('push_forget', { p_device: row.device_id }); }
      else failed++;
    }
  }));
  return json({ due: (data || []).length, sent, gone, failed });
});
