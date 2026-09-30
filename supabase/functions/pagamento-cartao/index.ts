// Marize Kids: grava o pedido da loja e cria o link de pagamento com cartão no Mercado Pago.
// Os preços vêm da vitrine (nunca do navegador do cliente) e a taxa de entrega é calculada aqui.
// Secret necessário (Edge Functions > Secrets): MP_ACCESS_TOKEN = Access Token de produção do Mercado Pago.
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOJA_URL = 'https://festafacil20.github.io/marizekids/loja.html';
// Reserva: as regras de entrega valem as que vêm do app pela vitrine (Configurações › Entrega)
const ENT_PADRAO = { cidades: [{ nome: 'Itaporã', taxa: 2, minimo: 50 }, { nome: 'Dourados', taxa: 7, minimo: 47 }], prazo: 2 };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const txt = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resp({ erro: 'método inválido' }, 405);
  try {
    const b = await req.json();
    const nome = txt(b.nome, 120), tel = txt(b.tel, 30), forma = b.forma === 'debito' ? 'debito' : 'credito';
    const receber = b.receber === 'retirada' ? 'retirada' : 'entrega';
    const cidade = receber === 'entrega' ? txt(b.cidade, 40) : '', end = receber === 'entrega' ? txt(b.end, 200) : '';
    if (!nome) return resp({ erro: 'Informe seu nome.' }, 400);
    if (tel.replace(/\D/g, '').length < 8) return resp({ erro: 'Informe um telefone.' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: vit, error: ev } = await sb.from('vitrine').select('data').eq('id', 1).single();
    if (ev || !vit) throw new Error('vitrine indisponível');
    const ent = vit.data.ent && Array.isArray(vit.data.ent.cidades) ? vit.data.ent : ENT_PADRAO;
    const regra = ent.cidades.find((c: { nome: string }) => c.nome === cidade) as { nome: string; taxa: number; minimo: number } | undefined;
    if (receber === 'entrega' && (!regra || end.length < 5)) return resp({ erro: 'Informe a cidade e o endereço.' }, 400);
    const produtos = new Map((vit.data.p || []).map((p: { id: string }) => [p.id, p]));
    // adicionais: "ad:<produto>:<adicional>" (ex.: +2 peças por R$ 2), com o preço da vitrine
    for (const p of vit.data.p || []) for (const a of p.ad || []) produtos.set(`ad:${p.id}:${a.id}`, { id: `ad:${p.id}:${a.id}`, n: '➕ ' + a.n, v: a.v, ad: true, arteId: p.id, adId: a.id });
    // p.ad do produto é a lista de ofertas; ad === true só no item adicional
    const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 50).map((i: { id: string; q: number }) => {
      const p = produtos.get(i.id) as { id: string; n: string; v: number; ad?: unknown; arteId?: string; adId?: string } | undefined, q = Math.floor(Number(i.q));
      return p && q >= 1 && q <= 99 ? { id: p.id, n: p.n, v: Number(p.v) || 0, q, ...(p.ad === true ? { ad: true, arteId: p.arteId, adId: p.adId } : {}) } : null;
    }).filter(Boolean) as { id: string; n: string; v: number; q: number; ad?: boolean }[];
    if (!itens.length) return resp({ erro: 'Nenhum produto válido no pedido.' }, 400);

    const subtotal = +itens.reduce((s, i) => s + i.v * i.q, 0).toFixed(2);
    const taxa = receber === 'entrega' && regra && subtotal < Number(regra.minimo) ? Number(regra.taxa) || 0 : 0;
    const total = +(subtotal + taxa).toFixed(2);
    const dados = { tipo: 'produtos', receber, cidade, end, forma, obs: txt(b.obs, 500), subtotal, taxa, total, itens, pagamento: 'mercadopago' };
    const { data: ped, error: ep } = await sb.from('pedidos').insert({ nome, tel, dados }).select('id').single();
    if (ep) throw ep;

    const mp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + Deno.env.get('MP_ACCESS_TOKEN'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [...itens.map(i => ({ id: i.id, title: i.n, quantity: i.q, unit_price: i.v, currency_id: 'BRL' })),
          ...(taxa ? [{ id: 'entrega', title: 'Taxa de entrega - ' + cidade, quantity: 1, unit_price: taxa, currency_id: 'BRL' }] : [])],
        payer: { name: nome },
        external_reference: ped.id,
        statement_descriptor: 'MARIZEKIDS',
        back_urls: { success: LOJA_URL + '?mp=ok', pending: LOJA_URL + '?mp=pendente', failure: LOJA_URL + '?mp=erro' },
        auto_return: 'approved',
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 12 },
      }),
    });
    const pref = await mp.json();
    if (!mp.ok || !pref.init_point) { console.error('Mercado Pago', mp.status, pref); return resp({ erro: 'mp', pedidoId: ped.id, total }, 502); }
    await sb.from('pedidos').update({ dados: { ...dados, mpLink: pref.init_point, mpPref: pref.id } }).eq('id', ped.id);
    return resp({ link: pref.init_point, pedidoId: ped.id, total, taxa });
  } catch (e) {
    console.error(e);
    return resp({ erro: 'Falha ao gerar o pagamento.' }, 500);
  }
});
