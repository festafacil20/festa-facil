'use strict';
/* ===== Nuvem (Supabase): login da gestão, sincronização dos dados e pedidos dos clientes ===== */
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);
const NK = 'festafacil.nuvem';
let nv; try { nv = JSON.parse(localStorage.getItem(NK)) || {}; } catch { nv = {}; } // { rev, sujo, vit }
const nvSave = () => localStorage.setItem(NK, JSON.stringify(nv));
let edicoes = 0, enviando = false, puxando = false, tSync, logado = false;

function statusNuvem() {
  const el = $('#nuvem'); if (!el) return;
  const [ic, t] = !logado ? ['', ''] : !navigator.onLine ? ['📴', 'Sem internet: salvo no aparelho, envia quando voltar'] : nv.sujo ? ['⏳', 'Salvando na nuvem...'] : ['☁️', 'Tudo salvo na nuvem'];
  el.textContent = ic; el.title = t;
}
// Chamado por save(): marca que há mudança e envia daqui a pouco
function nuvemAgendar() {
  if (!logado) return;
  edicoes++; nv.sujo = true; nvSave(); statusNuvem();
  clearTimeout(tSync); tSync = setTimeout(enviar, 1200);
}
async function enviar() {
  if (!logado || !nv.sujo || !navigator.onLine) return statusNuvem();
  if (enviando) return; // quando terminar, vê que ainda está sujo e envia de novo
  enviando = true;
  const marca = edicoes;
  let espera = 1200;
  try {
    await subirFotos();
    const { data: rev, error } = await sb.rpc('salvar_dados', { p_data: db, p_rev: nv.rev || 0 });
    if (error) throw error;
    if (rev == null) await conflito();
    else { nv.rev = rev; if (edicoes === marca) nv.sujo = false; nvSave(); publicarVitrine(); }
  } catch (e) { console.warn('Falha ao salvar na nuvem', e); espera = 15000; }
  enviando = false; statusNuvem();
  if (nv.sujo) { clearTimeout(tSync); tSync = setTimeout(enviar, espera); }
}
// Outro aparelho salvou antes: fica a versão da nuvem, a deste aparelho é guardada à parte
async function conflito() {
  const { data } = await sb.from('dados').select('data, rev').eq('id', 1).maybeSingle();
  if (!data) return;
  try { localStorage.setItem('festafacil.conflito', JSON.stringify(db)); } catch {}
  adotar(data);
  toast('Os dados mudaram em outro aparelho. Carreguei a versão mais nova; confira a última alteração.');
}
function adotar(row) {
  db = Object.assign(vazio(), row.data); migrar();
  localStorage.setItem(KEY, JSON.stringify(db));
  nv.rev = row.rev; nv.sujo = false; nvSave(); statusNuvem();
  if ($('#overlay').hidden) render();
}
const temDados = d => ['clientes', 'eventos', 'lancamentos', 'catalogo', 'produtos', 'compras', 'vendas', 'artes', 'kits'].some(k => (d[k] || []).length);
// Busca a versão da nuvem (ao abrir, ao voltar para o app e a cada minuto)
async function puxar() {
  if (!logado || !navigator.onLine || enviando || puxando) return statusNuvem();
  puxando = true;
  try {
    const { data, error } = await sb.from('dados').select('data, rev').eq('id', 1).maybeSingle();
    if (error) throw error;
    // Primeira vez neste aparelho: não deixa a nuvem apagar dados que só existem aqui
    if (nv.rev == null && temDados(db)) {
      try { localStorage.setItem('festafacil.antes-da-nuvem', JSON.stringify(db)); } catch {}
      if (!data || !temDados(data.data) || confirm('Este aparelho tem dados, e a nuvem também já tem dados.\n\nOK = enviar os dados DESTE aparelho para a nuvem (substitui os da nuvem).\nCancelar = usar os dados da nuvem neste aparelho.')) {
        nv.rev = data ? data.rev : 0; nv.sujo = true; nvSave(); return enviar();
      }
    }
    if (!data) { nv.rev = 0; nv.sujo = true; nvSave(); return enviar(); }
    if (data.rev > (nv.rev || 0)) { if (nv.sujo) { try { localStorage.setItem('festafacil.conflito', JSON.stringify(db)); } catch {} } adotar(data); }
    else if (nv.sujo) enviar();
  } catch (e) { console.warn('Falha ao buscar da nuvem', e); }
  finally { puxando = false; }
  statusNuvem();
}

/* Fotos: saem de dentro dos dados e vão para o Storage (deixa tudo leve e o cardápio rápido) */
async function subirFotos() {
  const listas = [...db.catalogo, ...(db.artes || [])].filter(o => (o.imgs || []).some(s => s.startsWith('data:')));
  for (const o of listas) {
    for (let k = 0; k < o.imgs.length; k++) {
      const s = o.imgs[k]; if (!s.startsWith('data:')) continue;
      const blob = await (await fetch(s)).blob(), nome = `${o.id}/${uid()}.jpg`;
      const { error } = await sb.storage.from('fotos').upload(nome, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) throw error;
      o.imgs[k] = sb.storage.from('fotos').getPublicUrl(nome).data.publicUrl;
    }
  }
  if (listas.length) localStorage.setItem(KEY, JSON.stringify(db));
}
// Publica o catálogo para a página de pedidos, só quando mudou
async function publicarVitrine() {
  const dados = dadosCardapio(true), txt = JSON.stringify(dados);
  let h = 0; for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) | 0;
  if (nv.vit === h) return;
  const { error } = await sb.from('vitrine').upsert({ id: 1, data: dados, updated_at: new Date().toISOString() });
  if (!error) { nv.vit = h; nvSave(); }
}

/* Login */
function telaLogin(erro) {
  logado = false; statusNuvem();
  $('#nav').hidden = true; $('#btnCfg').hidden = true; $('#btnAdd').hidden = true; $('#titulo').textContent = 'Festa Fácil';
  app.innerHTML = `<div class="card hero"><h2>🎈 Gestão</h2><p>Entre com o seu e-mail e senha para acessar.</p></div>
  <form class="card" id="flogin"><label style="margin-top:0">E-mail</label><input id="le" type="email" autocomplete="username" required>
  <label>Senha</label><input id="ls" type="password" autocomplete="current-password" required>
  ${erro ? `<div class="aviso bad" style="margin-top:10px">${esc(erro)}</div>` : ''}
  <button class="btn full" id="lb">Entrar</button></form>`;
  $('#flogin').onsubmit = async e => {
    e.preventDefault(); $('#lb').disabled = true; $('#lb').textContent = 'Entrando...';
    const { error } = await sb.auth.signInWithPassword({ email: $('#le').value.trim(), password: $('#ls').value });
    if (error) return telaLogin(navigator.onLine ? 'E-mail ou senha incorretos.' : 'Sem internet. Conecte-se para entrar.');
    entrar();
  };
}
async function entrar() {
  logado = true; $('#nav').hidden = false; $('#btnCfg').hidden = false;
  ir('dashboard'); await puxar();
}
async function sair() {
  if (nv.sujo && !confirm('Há alterações ainda não enviadas para a nuvem (sem internet?). Sair mesmo assim? Elas continuam neste aparelho.')) return;
  await sb.auth.signOut(); telaLogin();
}
async function iniciar() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return telaLogin();
  entrar();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') puxar(); });
window.addEventListener('online', () => { statusNuvem(); nv.sujo ? enviar() : puxar(); });
window.addEventListener('offline', statusNuvem);
setInterval(() => { if (document.visibilityState === 'visible' && !nv.sujo) puxar(); }, 60000);

/* ===== Pedidos dos clientes (loja de produtos e cardápio de festas) ===== */
const ehProd = p => p.dados && p.dados.tipo === 'produtos';
const stPed = p => ({ novo: 'Novo', visto: 'Visto', arquivado: 'Arquivado', convertido: ehProd(p) ? 'Virou venda' : 'Virou orçamento' })[p.status];
const clientePedido = p => {
  const dig = s => String(s || '').replace(/\D/g, '');
  let c = db.clientes.find(x => dig(x.tel) && dig(x.tel).slice(-8) === dig(p.tel).slice(-8));
  if (!c) { c = { id: uid(), nome: p.nome, tel: p.tel, obs: '' }; db.clientes.push(c); save(); }
  return c;
};
async function contarPedidos(el) {
  const { count } = await sb.from('pedidos').select('id', { count: 'exact', head: true }).eq('status', 'novo');
  if (el && el.isConnected) el.innerHTML = `<button class="btn ${count ? '' : 'sec'} full" style="margin:0 0 12px">📥 Pedidos dos clientes${count ? ` · <b>${count} novo(s)</b>` : ''}</button>`;
  if (el) el.onclick = () => ir('pedidos');
}
async function viewPedidos() {
  app.innerHTML = '<div class="vazio">Carregando pedidos...</div>';
  const arq = st.pedArq, tipo = st.pedTipo || '';
  let q = sb.from('pedidos').select('*').order('criado_em', { ascending: false }).limit(200);
  q = arq ? q.eq('status', 'arquivado') : q.neq('status', 'arquivado');
  const { data, error } = await q;
  if (rota !== 'pedidos') return;
  if (error) { app.innerHTML = '<div class="card vazio">Não foi possível carregar (sem internet?)</div>'; return; }
  st.peds = data;
  const lista = data.filter(p => !tipo || (tipo === 'p') === ehProd(p));
  const quando = s => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const resumo = p => ehProd(p) ? `🛍️ ${p.dados.itens.reduce((s, i) => s + i.q, 0)} produto(s)${p.dados.end ? ' · entrega' : ' · retirada'}` : `🎈 festa ${p.dados.data ? fdata(p.dados.data) : 'sem data'} · ${(p.dados.itens || []).length} item(ns)`;
  app.innerHTML = `<div class="tabs"><button data-pa="" class="${arq ? '' : 'on'}">Recebidos</button><button data-pa="1" class="${arq ? 'on' : ''}">Arquivados</button></div>
  <div class="chips"><button data-pt="" class="${tipo ? '' : 'on'}">Todos</button><button data-pt="p" class="${tipo === 'p' ? 'on' : ''}">🛍️ Produtos</button><button data-pt="f" class="${tipo === 'f' ? 'on' : ''}">🎈 Festas</button></div>
  <div class="card">${lista.map(p => `<div class="row" data-ped="${p.id}"><div><div class="t">${p.status === 'novo' ? '🟣 ' : ''}${esc(p.nome)}</div><div class="s">${quando(p.criado_em)} · ${resumo(p)}</div></div><div style="text-align:right"><span class="badge">${stPed(p)}</span><div class="s">${brl(p.dados.total)}${p.dados.combinar ? ' +' : ''}</div></div></div>`).join('') || '<div class="vazio">Nenhum pedido</div>'}</div>
  <button class="btn sec full" id="plinkp">🔗 Link da loja de produtos</button><button class="btn sec full" id="plinkf">🔗 Link de festas</button>`;
  app.querySelectorAll('[data-pa]').forEach(b => b.onclick = () => { st.pedArq = !!b.dataset.pa; viewPedidos(); });
  app.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { st.pedTipo = b.dataset.pt; viewPedidos(); });
  app.querySelectorAll('[data-ped]').forEach(r => r.onclick = () => formPedido(st.peds.find(p => p.id === r.dataset.ped)));
  $('#plinkp').onclick = gerarLoja; $('#plinkf').onclick = gerarCardapio;
}
async function statusPedido(p, s) {
  const { error } = await sb.from('pedidos').update({ status: s }).eq('id', p.id);
  if (error) { toast('Não foi possível atualizar (sem internet?)'); return false; }
  p.status = s; return true;
}
function formPedido(p) {
  const d = p.dados, prod = ehProd(p);
  if (p.status === 'novo') statusPedido(p, 'visto');
  const corpo = prod ? `
    <div class="row"><span>Entrega</span><b>${d.end ? esc(d.end) : 'vai retirar'}</b></div>
    ${d.obs ? `<div class="row"><span>Observações</span><b>${esc(d.obs)}</b></div>` : ''}
    <h3 style="margin:14px 0 4px">Produtos</h3>${d.itens.map(i => { const a = by(db.artes, i.id); return `<div class="row"><span>${i.q}× ${esc(i.n)}${a ? ` <small style="color:var(--mut)">(estoque ${saldoArte(a)})</small>` : ' <small style="color:var(--bad)">(excluído)</small>'}</span><b>${brl(i.v * i.q)}</b></div>`; }).join('')}
    <div class="total">Total: ${brl(d.total)}</div>
    <button class="btn full" id="pconv">🛍️ Registrar venda</button>` : `
    ${d.end ? `<div class="row"><span>Endereço</span><b>${esc(d.end)}</b></div>` : ''}
    <div class="row"><span>Data da festa</span><b>${d.data ? fdata(d.data) : 'ainda não definida'}</b></div>
    <div class="row"><span>Crianças</span><b>${d.cri === 'c' ? 'mais de 25 crianças' : 'até ' + FAIXAS[+d.cri] + ' crianças'}</b></div>
    <h3 style="margin:14px 0 4px">Itens</h3>${(d.itens || []).map(i => `<div class="row"><span>${esc(i.n)}${cit(i.id) ? '' : ' <small style="color:var(--bad)">(saiu do catálogo)</small>'}</span><b>${i.comb ? 'a combinar' : brl(i.v)}</b></div>`).join('')}
    <div class="total">Total: ${brl(d.total)}${d.combinar ? ' + itens a combinar' : ''}</div>
    ${d.data && d.itens.some(i => { const it = cit(i.id); return it && mod(it) === 'd' && reservado(i.id, d.data) + 1 > it.estoque; }) ? '<div class="aviso bad">⚠️ Algum brinquedo já está todo reservado nessa data</div>' : ''}
    <button class="btn full" id="pconv">📅 Criar orçamento na agenda</button>`;
  sheet((prod ? '🛍️ ' : '🎈 ') + 'Pedido de ' + p.nome, `
    <div class="row"><span>Telefone</span><b>${esc(p.tel)}</b></div>${corpo}
    <button class="btn wa full" id="pwa">Responder no WhatsApp</button>
    ${p.status === 'arquivado' ? '<button class="btn sec full" id="pdes">Desarquivar</button>' : '<button class="btn sec full" id="parq">Arquivar</button>'}
    <button class="btn del full" id="pdel">Excluir pedido</button>`, () => {
    $('#pwa').onclick = () => window.open(wa(p.tel, prod ? `Olá ${p.nome}! Recebemos seu pedido 🛍️` : `Olá ${p.nome}! Recebemos seu pedido para a festa${d.data ? ' do dia ' + fdata(d.data) : ''} 🎉`), '_blank');
    $('#pconv').onclick = () => {
      const obs = `Pedido ${prod ? 'pela loja' : 'pelo cardápio'} em ${new Date(p.criado_em).toLocaleDateString('pt-BR')}`;
      if (prod) {
        const itens = d.itens.filter(i => by(db.artes, i.id)).map(i => ({ arteId: i.id, q: i.q, preco: i.v }));
        if (!itens.length) return toast('Os produtos deste pedido não existem mais');
        const c = clientePedido(p); statusPedido(p, 'convertido');
        return formVenda(null, { clienteId: c.id, itens, pago: false, obs: obs + (d.end ? ` · entregar em ${d.end}` : ' · retirada') + (d.obs ? ` · ${d.obs}` : '') });
      }
      const c = clientePedido(p);
      const itens = (d.itens || []).filter(i => cit(i.id)).map(i => mod(cit(i.id)) === 'f' ? (d.cri === 'c' ? { id: i.id, fx: 'c', q: 1, vc: 0, cc: 0 } : { id: i.id, fx: String(FAIXAS[+d.cri]), q: 1 }) : { id: i.id, q: 1 });
      const ev = { id: uid(), clienteId: c.id, data: d.data || hoje(), hora: '14:00', local: d.end || '', itens, sinal: 0, sinalForma: '', sinalPago: false, restoForma: '', restoPago: false, status: 'orcamento', obs: obs + (d.data ? '' : ' (cliente ainda sem data definida)') };
      db.eventos.push(ev); save(); statusPedido(p, 'convertido');
      toast('Orçamento criado na agenda'); formEvento(ev);
    };
    const arquivar = s => async () => { if (await statusPedido(p, s)) { fechar(); viewPedidos(); } };
    if ($('#parq')) $('#parq').onclick = arquivar('arquivado'); else $('#pdes').onclick = arquivar('visto');
    $('#pdel').onclick = async () => {
      if (!confirm('Excluir este pedido?')) return;
      const { error } = await sb.from('pedidos').delete().eq('id', p.id);
      if (error) return toast('Não foi possível excluir'); fechar(); viewPedidos();
    };
  });
}
rotas.pedidos = () => viewPedidos();
titulos.pedidos = 'Pedidos';
