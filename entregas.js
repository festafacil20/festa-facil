'use strict';
/* ===== Painel de pedidos e entregas =====
   Pedidos de produtos (loja ou lançados à mão) passam pelas etapas abaixo; o andamento fica em pedidos.dados
   (etapa, pago, hist, vendaId). Pedidos de festas continuam no fluxo de orçamento (formPedido em nuvem.js). */
const ETAPAS = ['novo', 'preparo', 'pronto', 'rota', 'entregue', 'cancelado'];
const ENTREGA = { cidades: ['Itaporã', 'Dourados'], taxa: 7, minimo: 47 }; // mesma regra de loja.js e da função pagamento-cartao
const retira = d => entregaPed(d) === 'retirada';
const etapaDe = p => p.dados.etapa || 'novo';
function nomeEtapa(e, d) {
  if (e === 'pronto') return retira(d) ? '📦 Pronto p/ retirada' : '📦 Pronto p/ entrega';
  if (e === 'entregue') return retira(d) ? '✅ Retirado' : '✅ Entregue';
  return { novo: '🆕 Novo', preparo: '🛠️ Em preparo', rota: '🚚 Saiu p/ entrega', cancelado: '❌ Cancelado' }[e];
}
function proxima(p) { // [etapa seguinte, texto do botão]
  const d = p.dados;
  return {
    novo: ['preparo', '🛠️ Iniciar preparo'], preparo: ['pronto', '📦 Marcar como pronto'],
    pronto: retira(d) ? ['entregue', '✅ Cliente retirou'] : ['rota', '🚚 Saiu para entrega'], rota: ['entregue', '✅ Marcar entregue'],
  }[etapaDe(p)];
}
function msgEtapa(p) {
  const d = p.dados, e = etapaDe(p), nome = p.nome.split(' ')[0], loja = db.config.nome || 'Marize Kids';
  const cobra = !d.pago && e !== 'cancelado' ? `\n\nTotal: ${brl(d.total)}${d.forma ? ' (' + (FORMAS_ALL[d.forma] || d.forma) + ')' : ''}` : '';
  const t = {
    novo: `Olá ${nome}! Recebemos seu pedido na ${loja} 💜 Já já começamos a preparar.`,
    preparo: `Olá ${nome}! Seu pedido na ${loja} está sendo preparado 🎨`,
    pronto: retira(d) ? `Olá ${nome}! Seu pedido está pronto para retirada 📦 Qual o melhor horário para você?` : `Olá ${nome}! Seu pedido está pronto e logo sai para entrega 📦`,
    rota: `Olá ${nome}! Seu pedido saiu para entrega 🚚 Em breve chega em ${d.end}${d.cidade ? ' - ' + d.cidade : ''}.`,
    entregue: `Olá ${nome}! Obrigado pela compra na ${loja} 💜 Esperamos que goste!`,
    cancelado: `Olá ${nome}! Seu pedido na ${loja} foi cancelado. Qualquer dúvida, é só chamar.`,
  }[e];
  return t + (e === 'entregue' || e === 'cancelado' ? '' : cobra);
}
const zapEtapa = () => db.config.zapEtapa !== false;
function avisarEtapa(p, nova) { if (zapEtapa() && nova !== 'novo') window.open(wa(p.tel, msgEtapa({ ...p, dados: { ...p.dados, etapa: nova } })), '_blank'); }
const vendaDoPedido = p => p.dados.vendaId && by(db.vendas, p.dados.vendaId);
async function gravarPedido(p, extra = {}) {
  const { error } = await sb.from('pedidos').update({ dados: p.dados, ...extra }).eq('id', p.id);
  if (error) { toast('Não foi possível salvar (sem internet?)'); return false; }
  Object.assign(p, extra); return true;
}
async function mudarEtapa(p, e) {
  const d = p.dados, antes = d.etapa;
  d.etapa = e; d.hist = [...(d.hist || []), { e, t: new Date().toISOString() }];
  if (!await gravarPedido(p, p.status === 'novo' ? { status: 'visto' } : {})) { d.etapa = antes; d.hist.pop(); return false; }
  toast(nomeEtapa(e, d));
  if (e === 'entregue' && !vendaDoPedido(p) && confirm('Pedido entregue! Registrar a venda agora? (dá baixa no estoque e lança no Caixa)')) registrarVendaPedido(p);
  if (e === 'cancelado' && vendaDoPedido(p)) alert('Este pedido tem uma venda registrada. Se o dinheiro não entrou, exclua a venda em Vendas para devolver o estoque.');
  return true;
}
function registrarVendaPedido(p) {
  const d = p.dados, itens = d.itens.filter(i => by(db.artes, i.id)).map(i => ({ arteId: i.id, q: i.q, preco: i.v }));
  if (!itens.length) return toast('Os produtos deste pedido não existem mais');
  const c = clientePedido(p), id = uid();
  d.vendaId = id; gravarPedido(p, { status: 'convertido' });
  const receb = retira(d) ? 'retirada' : `entregar em ${d.end}${d.cidade ? ' - ' + d.cidade : ''}`;
  formVenda(null, { id, clienteId: c.id, itens, pago: !!d.pago, taxa: d.taxa || 0, ...(d.forma ? { forma: d.forma } : {}), obs: `Pedido de ${new Date(p.criado_em).toLocaleDateString('pt-BR')} · ${receb}${d.obs ? ' · ' + d.obs : ''}` });
}

/* ---- Início: resumo ---- */
async function contarPedidos(el) {
  const { data } = await sb.from('pedidos').select('status, dados').neq('status', 'arquivado').limit(300);
  if (!el || !el.isConnected || !data) return;
  const prods = data.filter(ehProd), cont = e => prods.filter(p => etapaDe(p) === e).length;
  const naoVistos = data.filter(p => p.status === 'novo').length, prontos = cont('pronto'), rota = cont('rota');
  const partes = [naoVistos && `<b>${naoVistos} novo(s)</b>`, cont('preparo') && `${cont('preparo')} em preparo`, prontos && `${prontos} pronto(s)`, rota && `${rota} em rota`].filter(Boolean);
  el.innerHTML = `<button class="btn ${naoVistos ? '' : 'sec'} full" style="margin:0 0 12px">🚚 Pedidos${partes.length ? ' · ' + partes.join(' · ') : ''}</button>`;
  el.onclick = () => ir('pedidos');
}

/* ---- Painel ---- */
const FILTROS = [['ativos', 'Em andamento'], ['novo', '🆕 Novos'], ['preparo', '🛠️ Preparo'], ['pronto', '📦 Prontos'], ['rota', '🚚 Em rota'], ['entregue', '✅ Entregues'], ['cancelado', '❌ Cancelados'], ['festas', '🎈 Festas']];
async function viewPedidos() {
  app.innerHTML = '<div class="vazio">Carregando pedidos...</div>';
  const { data, error } = await sb.from('pedidos').select('*').neq('status', 'arquivado').order('criado_em', { ascending: false }).limit(300);
  if (rota !== 'pedidos') return;
  if (error) { app.innerHTML = '<div class="card vazio">Não foi possível carregar (sem internet?)</div>'; return; }
  st.peds = data;
  const f = st.pedFiltro || 'ativos', prods = data.filter(ehProd), festas = data.filter(p => !ehProd(p));
  const ativos = prods.filter(p => !['entregue', 'cancelado'].includes(etapaDe(p)));
  const aReceber = prods.filter(p => !p.dados.pago && etapaDe(p) !== 'cancelado').reduce((s, p) => s + (p.dados.total || 0), 0);
  const conta = e => prods.filter(p => etapaDe(p) === e).length;
  let lista = f === 'festas' ? festas : f === 'ativos' ? ativos : prods.filter(p => etapaDe(p) === f);
  if (f === 'ativos') lista = [...lista].sort((a, b) => ETAPAS.indexOf(etapaDe(b)) - ETAPAS.indexOf(etapaDe(a)) || a.criado_em.localeCompare(b.criado_em)); // mais adiantados primeiro, mais antigos antes
  const quando = s => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const cartao = p => {
    if (!ehProd(p)) return `<div class="card ped" data-ped="${p.id}"><div class="t">🎈 ${esc(p.nome)} <span class="badge">${stPed(p)}</span></div><div class="s">${quando(p.criado_em)} · festa ${p.dados.data ? fdata(p.dados.data) : 'sem data'} · ${brl(p.dados.total)}</div></div>`;
    const d = p.dados, nx = proxima(p), e = etapaDe(p);
    return `<div class="card ped" data-ped="${p.id}">
      <div class="pedtop"><b>${p.status === 'novo' ? '🟣 ' : ''}${esc(p.nome)}</b><span class="badge et-${e}">${nomeEtapa(e, d)}</span></div>
      <div class="s">${quando(p.criado_em)} · ${esc(d.itens.map(i => i.q + '× ' + i.n).join(', '))}</div>
      <div class="s">${retira(d) ? '🏠 Retirada' : `🚚 ${esc(d.cidade || '')} · ${esc(d.end || '')}`}</div>
      <div class="pedrow"><b>${brl(d.total)}</b><span class="badge ${d.pago ? 'ok' : 'bad'}">${d.pago ? '💰 pago' : 'a receber'}</span><small style="color:var(--mut)">${esc(FORMAS_ALL[d.forma] || '')}</small>${vendaDoPedido(p) ? '<small style="color:var(--ok)">· venda ✔</small>' : ''}</div>
      ${e === 'entregue' || e === 'cancelado' ? '' : `<div class="pedbtns">${nx ? `<button class="btn sm" data-av="${p.id}">${nx[1]}</button>` : ''}<button class="btn wa sm" data-zap="${p.id}">💬 Avisar</button></div>`}
    </div>`;
  };
  app.innerHTML = `<div class="grid3" style="margin-bottom:8px"><div class="kpi"><small>Novos</small><b>${conta('novo')}</b></div><div class="kpi"><small>Em preparo</small><b>${conta('preparo')}</b></div><div class="kpi"><small>Prontos</small><b>${conta('pronto')}</b></div></div>
  <div class="grid3" style="margin-bottom:12px"><div class="kpi"><small>Em rota</small><b>${conta('rota')}</b></div><div class="kpi"><small>Entregues</small><b class="pos">${conta('entregue')}</b></div><div class="kpi"><small>A receber</small><b class="${aReceber ? 'neg' : ''}">${brl(aReceber)}</b></div></div>
  <div class="chk" style="margin:0 0 10px"><input type="checkbox" id="pzap" ${zapEtapa() ? 'checked' : ''}><label style="margin:0">📲 Ao mudar a etapa, abrir o WhatsApp do cliente com o aviso</label></div>
  <div class="chips">${FILTROS.map(([k, t]) => `<button data-pf="${k}" class="${f === k ? 'on' : ''}">${t}${k === 'ativos' ? ` (${ativos.length})` : ''}</button>`).join('')}</div>
  ${lista.map(cartao).join('') || '<div class="card vazio">Nenhum pedido aqui</div>'}
  <button class="btn full" id="pnovo">＋ Lançar pedido (WhatsApp / presencial)</button>
  <button class="btn sec full" id="plinkp">🔗 Link da loja de produtos</button><button class="btn sec full" id="plinkf">🔗 Link de festas</button>`;
  const achar = id => st.peds.find(p => p.id === id);
  app.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { st.pedFiltro = b.dataset.pf; viewPedidos(); });
  app.querySelectorAll('[data-ped]').forEach(c => c.onclick = e => { if (!e.target.closest('button')) formPedido(achar(c.dataset.ped)); });
  $('#pzap').onchange = () => { db.config.zapEtapa = $('#pzap').checked; save(); };
  app.querySelectorAll('[data-av]').forEach(b => b.onclick = async () => { const p = achar(b.dataset.av); b.disabled = true; avisarEtapa(p, proxima(p)[0]); if (await mudarEtapa(p, proxima(p)[0])) viewPedidos(); else b.disabled = false; });
  app.querySelectorAll('[data-zap]').forEach(b => b.onclick = () => { const p = achar(b.dataset.zap); window.open(wa(p.tel, msgEtapa(p)), '_blank'); });
  $('#pnovo').onclick = () => formNovoPedido();
  $('#plinkp').onclick = gerarLoja; $('#plinkf').onclick = gerarCardapio;
}

/* ---- Detalhe de um pedido de produtos ---- */
function formPedidoProd(p) {
  const d = p.dados, e = etapaDe(p), nx = proxima(p), venda = vendaDoPedido(p);
  if (p.status === 'novo') gravarPedido(p, { status: 'visto' });
  const mapa = !retira(d) && d.end ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${d.end}, ${d.cidade || ''} - MS`) : '';
  const etapasPossiveis = ETAPAS.filter(x => !(x === 'rota' && retira(d)));
  sheet('🛍️ Pedido de ' + p.nome, `
    <div class="row"><span>Etapa</span><b>${nomeEtapa(e, d)}</b></div>
    <div class="row"><span>Telefone</span><b>${esc(p.tel)}</b></div>
    <div class="row"><span>Receber</span><b>${retira(d) ? 'vai retirar' : esc(`${d.end}${d.cidade ? ' - ' + d.cidade : ''}`)}</b></div>
    ${d.obs ? `<div class="row"><span>Observações</span><b>${esc(d.obs)}</b></div>` : ''}
    <h3 style="margin:14px 0 4px">Produtos</h3>${d.itens.map(i => { const a = by(db.artes, i.id); return `<div class="row"><span>${i.q}× ${esc(i.n)}${a ? ` <small style="color:var(--mut)">(estoque ${saldoArte(a)})</small>` : ' <small style="color:var(--bad)">(excluído)</small>'}</span><b>${brl(i.v * i.q)}</b></div>`; }).join('')}
    ${d.taxa ? `<div class="row"><span>Taxa de entrega</span><b>${brl(d.taxa)}</b></div>` : ''}
    <div class="total">Total: ${brl(d.total)}</div>
    <div class="row"><span>Pagamento</span><b>${esc(FORMAS_ALL[d.forma] || 'não informado')}</b></div>
    <div class="chk"><input type="checkbox" id="ppago" ${d.pago ? 'checked' : ''}><label style="margin:0"><b>💰 Pagamento recebido</b>${d.pagoEm ? ` <small style="color:var(--mut)">(${new Date(d.pagoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})</small>` : ''}</label></div>
    ${d.mpLink ? '<button class="btn sec full" id="pmp">📋 Copiar link de pagamento (cartão)</button>' : ''}
    ${nx && e !== 'cancelado' ? `<button class="btn full" id="pav">${nx[1]}</button>` : ''}
    <button class="btn wa full" id="pwa">💬 Avisar cliente no WhatsApp</button>
    ${mapa ? `<a class="btn sec full" href="${mapa}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;box-sizing:border-box">🗺️ Abrir endereço no mapa</a>` : ''}
    ${venda ? `<div class="aviso" style="margin-top:10px">✔ Venda registrada em ${fdata(venda.data)} (${brl(totalVenda(venda))})</div><button class="btn sec full" id="pvv">Ver a venda</button>` : '<button class="btn sec full" id="pconv">🛍️ Registrar venda (baixa do estoque + Caixa)</button>'}
    <label>Mudar etapa manualmente</label><select id="pet">${etapasPossiveis.map(x => `<option value="${x}" ${x === e ? 'selected' : ''}>${nomeEtapa(x, d)}</option>`).join('')}</select>
    ${(d.hist || []).length ? `<h3 style="margin:14px 0 4px">Histórico</h3><div class="row"><span>Pedido feito</span><small>${new Date(p.criado_em).toLocaleString('pt-BR')}</small></div>${d.hist.map(h => `<div class="row"><span>${nomeEtapa(h.e, d)}</span><small>${new Date(h.t).toLocaleString('pt-BR')}</small></div>`).join('')}` : ''}
    <button class="btn del full" id="pdel">Excluir pedido</button>`, () => {
    const volta = () => { fechar(); if (rota === 'pedidos') viewPedidos(); };
    $('#ppago').onchange = async () => { d.pago = $('#ppago').checked; d.pagoEm = d.pago ? new Date().toISOString() : null; if (await gravarPedido(p)) { toast(d.pago ? 'Pagamento recebido' : 'Marcado como a receber'); if (venda && venda.pago !== d.pago) toast('Lembre de ajustar o "já recebi" na venda'); } };
    if ($('#pmp')) $('#pmp').onclick = async () => { try { await navigator.clipboard.writeText(d.mpLink); toast('Link copiado'); } catch { prompt('Copie o link:', d.mpLink); } };
    // Depois de mudar a etapa fecha o detalhe, a não ser que a tela de venda tenha sido aberta (entregue › registrar venda)
    const etapa = async nova => { if (await mudarEtapa(p, nova) && !$('#vsave')) volta(); };
    if ($('#pav')) $('#pav').onclick = () => { avisarEtapa(p, nx[0]); etapa(nx[0]); };
    $('#pet').onchange = () => { avisarEtapa(p, $('#pet').value); etapa($('#pet').value); };
    $('#pwa').onclick = () => window.open(wa(p.tel, msgEtapa(p)), '_blank');
    if ($('#pconv')) $('#pconv').onclick = () => registrarVendaPedido(p);
    if ($('#pvv')) $('#pvv').onclick = () => formVenda(venda);
    $('#pdel').onclick = async () => {
      if (!confirm('Excluir este pedido?' + (venda ? ' (a venda registrada continua em Vendas)' : ''))) return;
      const { error } = await sb.from('pedidos').delete().eq('id', p.id);
      if (error) return toast('Não foi possível excluir'); volta();
    };
  });
}

/* ---- Lançar pedido à mão (veio pelo WhatsApp, Instagram ou pessoalmente) ---- */
function formNovoPedido() {
  const artes = db.artes.filter(a => a.loja !== false || kitDe(a));
  if (!artes.length) { st.vt = 'artes'; ir('vendas'); return toast('Cadastre os produtos em Vendas › Artes / produtos'); }
  let receber = 'entrega';
  sheet('Lançar pedido', `
    <label>Nome do cliente</label><input id="nn" list="nncli"><datalist id="nncli">${db.clientes.map(c => `<option value="${esc(c.nome)}">`).join('')}</datalist>
    <label>Telefone / WhatsApp</label><input id="nt" inputmode="tel">
    <label>Produtos</label>${artes.map(a => `<div class="itemsel" style="margin-top:6px"><span>${esc(a.nome)}<br><small style="color:var(--mut)">${brl(a.preco)} · estoque ${saldoArte(a)}</small></span><input type="number" min="0" inputmode="numeric" data-nq="${a.id}" value="0"></div>`).join('')}
    <label>Forma de pagamento</label><select id="nf">${['pix', 'credito', 'debito', 'dinheiro'].map(k => `<option value="${k}">${FORMAS_ALL[k]}</option>`).join('')}</select>
    <div class="chk"><input type="checkbox" id="np"><label style="margin:0">Já recebi o pagamento</label></div>
    <label>Como vai receber</label><div class="tabs" style="margin:0"><button type="button" data-nr="entrega" class="on">🚚 Entrega</button><button type="button" data-nr="retirada">🏠 Retirada</button></div>
    <div id="nbox"><label>Cidade</label><select id="nc">${ENTREGA.cidades.map(c => `<option>${c}</option>`).join('')}</select><label>Endereço</label><input id="ne" placeholder="Rua, número, bairro"></div>
    <label>Taxa de entrega (R$)</label><input id="ntx" inputmode="decimal">
    <label>Observações</label><textarea id="no" rows="2"></textarea>
    <div class="total" id="ntot"></div>
    <button class="btn full" id="nsave">Lançar pedido</button>`, b => {
    const cli = () => db.clientes.find(c => c.nome === $('#nn').value.trim());
    $('#nn').onchange = () => { const c = cli(); if (c && !$('#nt').value) $('#nt').value = c.tel || ''; };
    let taxaManual = false;
    const itens = () => artes.map(a => ({ a, q: Math.max(0, parseInt(b.querySelector(`[data-nq="${a.id}"]`).value) || 0) })).filter(i => i.q);
    const atual = e => {
      if (e && e.target.id === 'ntx') taxaManual = true;
      const sub = itens().reduce((s, i) => s + i.a.preco * i.q, 0);
      if (!taxaManual) $('#ntx').value = receber === 'entrega' && $('#nc').value === 'Dourados' && sub > 0 && sub < ENTREGA.minimo ? ENTREGA.taxa : '';
      $('#ntot').textContent = 'Total: ' + brl(sub + num($('#ntx').value));
    };
    b.addEventListener('input', atual); b.addEventListener('change', atual); atual();
    b.querySelectorAll('[data-nr]').forEach(x => x.onclick = () => { receber = x.dataset.nr; b.querySelectorAll('[data-nr]').forEach(y => y.classList.toggle('on', y === x)); $('#nbox').hidden = receber !== 'entrega'; taxaManual = false; atual(); });
    $('#nsave').onclick = async () => {
      const nome = $('#nn').value.trim(), tel = $('#nt').value.trim(), its = itens();
      if (!nome) return toast('Informe o nome do cliente');
      if (tel.replace(/\D/g, '').length < 8) return toast('Informe o telefone');
      if (!its.length) return toast('Informe a quantidade de ao menos um produto');
      if (receber === 'entrega' && $('#ne').value.trim().length < 5) return toast('Informe o endereço');
      const subtotal = its.reduce((s, i) => s + i.a.preco * i.q, 0), taxa = num($('#ntx').value), pago = $('#np').checked;
      const dados = { tipo: 'produtos', origem: 'manual', receber, cidade: receber === 'entrega' ? $('#nc').value : '', end: receber === 'entrega' ? $('#ne').value.trim() : '', forma: $('#nf').value, obs: $('#no').value.trim(), subtotal, taxa, total: +(subtotal + taxa).toFixed(2), itens: its.map(i => ({ id: i.a.id, n: i.a.nome, v: i.a.preco, q: i.q })), pago, pagoEm: pago ? new Date().toISOString() : null, etapa: 'novo', hist: [] };
      $('#nsave').disabled = true;
      const { data, error } = await sb.from('pedidos').insert({ nome, tel, status: 'novo', dados }).select().single();
      if (error) { $('#nsave').disabled = false; return toast('Não foi possível lançar (sem internet?)'); }
      await gravarPedido(data, { status: 'visto' }); // lançado por você: já nasce "visto"
      fechar(); toast('Pedido lançado'); st.pedFiltro = 'ativos';
      if (rota === 'pedidos') viewPedidos(); else ir('pedidos');
    };
  });
}

/* ---- Aviso de pedido novo dentro do app (a cada 30 s com o app aberto) ---- */
const UK = 'festafacil.ultped';
function bip() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.18].forEach(t => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.25, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.15); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.16); }); } catch {} }
async function vigiarPedidos() {
  if (!logado || document.visibilityState !== 'visible') return;
  const { data } = await sb.from('pedidos').select('id, nome, criado_em, dados').eq('status', 'novo').order('criado_em', { ascending: false }).limit(50);
  if (!data) return;
  const b = document.querySelector('#nav [data-r="pedidos"]');
  if (b) { let s = b.querySelector('.navbadge'); if (!s) { s = document.createElement('span'); s.className = 'navbadge'; b.appendChild(s); } s.textContent = data.length; s.hidden = !data.length; }
  let ult = ''; try { ult = localStorage.getItem(UK) || ''; } catch {}
  const novos = data.filter(p => p.criado_em > ult && (p.dados || {}).origem !== 'manual');
  if (data[0] && data[0].criado_em > ult) try { localStorage.setItem(UK, data[0].criado_em); } catch {}
  if (!ult || !novos.length) return; // primeira vez neste aparelho: só marca onde parou
  toast(novos.length > 1 ? `🛍️ ${novos.length} pedidos novos!` : `🛍️ Novo pedido de ${novos[0].nome}!`); bip(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (rota === 'pedidos' && $('#overlay').hidden) viewPedidos(); else if (rota === 'dashboard') contarPedidos($('#dpeds'));
}
setInterval(vigiarPedidos, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') vigiarPedidos(); });
window.addEventListener('hashchange', () => { if (location.hash === '#pedidos' && logado) ir('pedidos'); });

/* ---- Notificações no celular (Web Push), ativadas em Configurações ---- */
const b64u = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function inscricaoAtual() { try { const r = await navigator.serviceWorker.ready; return await r.pushManager.getSubscription(); } catch { return null; } }
// No iPhone o push só existe com o app instalado na Tela de Início (iOS 16.4+)
function semPushMsg() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), instalado = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !instalado) return 'No iPhone, as notificações só funcionam com o app instalado: abra este site no <b>Safari</b>, toque em <b>Compartilhar</b> (quadrado com seta para cima) › <b>Adicionar à Tela de Início</b>, abra o app pelo ícone e volte aqui.';
  if (ios) return 'Para receber notificações, atualize o iPhone para o iOS 16.4 ou mais recente (Ajustes › Geral › Atualização de Software).';
  return 'Este navegador não aceita notificações. No celular, use o Chrome.';
}
async function cardNotificacoes(host) {
  if (!host) return;
  const suporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const sub = suporta && Notification.permission === 'granted' ? await inscricaoAtual() : null;
  if (!host.isConnected) return;
  host.innerHTML = `<h3>🔔 Notificações de novo pedido</h3>
    <p class="s" style="color:var(--mut);margin-top:0">Receba um aviso no celular a cada pedido novo, mesmo com o app fechado. Ative em cada aparelho (o seu e o da sua equipe).</p>
    ${!suporta ? `<div class="aviso">${semPushMsg()}</div>`
      : Notification.permission === 'denied' ? '<div class="aviso bad">As notificações foram bloqueadas neste aparelho. Libere em: Configurações do Chrome › Notificações (ou no cadeado ao lado do endereço) e volte aqui.</div>'
      : sub ? '<div class="aviso" style="background:#e7f7ec;border-color:var(--ok)">✅ Ativadas neste aparelho</div><button class="btn sec full" id="nteste">Enviar notificação de teste</button><button class="btn sec full" id="ndesl">Desativar neste aparelho</button>'
      : '<button class="btn full" id="nativ">🔔 Ativar notificações neste aparelho</button>'}`;
  const teste = async s => { const { error } = await sb.functions.invoke('notificar-pedido', { body: { teste: s.endpoint } }); toast(error ? 'Não consegui enviar o teste (a função notificar-pedido está publicada?)' : 'Teste enviado: a notificação chega em alguns segundos'); };
  if ($('#nativ')) $('#nativ').onclick = async () => {
    if (await Notification.requestPermission() !== 'granted') return cardNotificacoes(host);
    try {
      const r = await navigator.serviceWorker.ready;
      const s = await r.pushManager.getSubscription() || await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLICA) });
      const j = s.toJSON();
      const { error } = await sb.from('push_subs').upsert({ endpoint: j.endpoint, sub: j, aparelho: navigator.userAgent.slice(0, 150) });
      if (error) throw error;
      toast('Notificações ativadas'); await teste(s);
    } catch (e) { console.warn(e); toast('Não foi possível ativar (sem internet?)'); }
    cardNotificacoes(host);
  };
  if ($('#nteste')) $('#nteste').onclick = () => teste(sub);
  if ($('#ndesl')) $('#ndesl').onclick = async () => { await sb.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); toast('Notificações desativadas neste aparelho'); cardNotificacoes(host); };
}
