// Marize Kids: envia notificação (Web Push) para os aparelhos da gestão quando chega um pedido novo.
// Chamada pelo gatilho pedidos_notificar (supabase/004_notificacoes.sql) e pelo botão "Enviar teste" do app.
// Secrets necessários: VAPID_PUBLICA e VAPID_PRIVADA.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    webpush.setVapidDetails('https://festafacil20.github.io/marizekids/', Deno.env.get('VAPID_PUBLICA')!, Deno.env.get('VAPID_PRIVADA')!);
    let msg: Record<string, string>, alvos: { endpoint: string; sub: webpush.PushSubscription }[] = [];
    if (b.teste) { // teste: só para o aparelho que pediu (e que já está cadastrado)
      const { data } = await sb.from('push_subs').select('endpoint, sub').eq('endpoint', String(b.teste));
      alvos = data || [];
      msg = { title: '🔔 Notificações ativadas', body: 'Você vai receber um aviso a cada novo pedido.', url: './#pedidos', tag: 'teste' };
    } else {
      const { data: p } = await sb.from('pedidos').select('*').eq('id', b.id).maybeSingle();
      // só pedidos que acabaram de chegar, e não os lançados à mão no próprio app
      if (!p || Date.now() - new Date(p.criado_em).getTime() > 5 * 60 * 1000 || p.dados?.origem === 'manual') return resp({ ok: false });
      const d = p.dados || {};
      const itens = (d.itens || []).map((i: { q?: number; n: string }) => (i.q ? i.q + '× ' : '') + i.n).join(', ');
      const receber = d.tipo === 'produtos' ? (d.receber === 'retirada' ? ' · retirada' : ` · entrega ${d.cidade || ''}`) : ' · festa';
      msg = { title: `🛍️ Novo pedido: ${p.nome}`, body: `${brl(d.total)}${receber}\n${itens}`, url: './#pedidos', tag: p.id };
      const { data } = await sb.from('push_subs').select('endpoint, sub');
      alvos = data || [];
    }
    let enviados = 0;
    await Promise.all(alvos.map(async (s) => {
      try { await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 86400, urgency: 'high' }); enviados++; }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subs').delete().eq('endpoint', s.endpoint); // aparelho desativou
        else console.error('push', code, e);
      }
    }));
    return resp({ ok: true, enviados });
  } catch (e) {
    console.error(e);
    return resp({ erro: 'falha' }, 500);
  }
});
