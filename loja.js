'use strict';
/* Loja pública: o cliente escolhe produtos e envia o pedido (cai em Pedidos, no app de gestão) */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const H = { apikey: SUPA_KEY, 'Content-Type': 'application/json' };
let d = null;
const S = { q: {}, ad: {}, nome: '', tel: '', forma: '', receber: 'entrega', cidade: '', end: '', obs: '' };
// Entrega: regras por cidade vêm do app (Configurações › Entrega) pela vitrine; estas são só a reserva
const ENT_PADRAO = { cidades: [{ nome: 'Itaporã', taxa: 2, minimo: 50 }, { nome: 'Dourados', taxa: 7, minimo: 47 }], prazo: 2 };
const ent = () => (d && d.ent && d.ent.cidades) ? d.ent : ENT_PADRAO;
const regra = () => ent().cidades.find(c => c.nome === S.cidade);
const txtRegra = c => !c.taxa ? 'entrega grátis' : `grátis a partir de ${brl(c.minimo)}; abaixo disso, taxa de ${brl(c.taxa)}`;
const txtPrazo = () => ent().prazo ? `📅 Prazo de entrega: ${ent().prazo} dia${ent().prazo > 1 ? 's' : ''}` : '';
const FORMAS = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro' };

// Adicionais (ofertas do produto, ex.: "+2 peças por R$ 2"): só valem junto com o produto escolhido
const chaveAd = (p, a) => p.id + ':' + a.id;
const itemAd = (p, a) => ({ id: 'ad:' + chaveAd(p, a), n: '➕ ' + a.n, v: a.v, ad: true, arteId: p.id, adId: a.id });
const adsDisponiveis = () => d.p.filter(p => S.q[p.id] > 0).flatMap(p => (p.ad || []).map(a => ({ p, a })));
const itens = () => [...d.p.filter(x => S.q[x.id] > 0).map(x => ({ x, q: S.q[x.id] })),
  ...adsDisponiveis().filter(({ p, a }) => S.ad[chaveAd(p, a)] > 0).map(({ p, a }) => ({ x: itemAd(p, a), q: S.ad[chaveAd(p, a)] }))];
const subtotal = () => itens().reduce((s, i) => s + i.x.v * i.q, 0);
const taxa = () => { if (S.receber !== 'entrega') return 0; const c = regra(); return c && subtotal() < c.minimo ? c.taxa : 0; };
const total = () => subtotal() + taxa();
function barra(txtBotao) {
  const n = itens().reduce((s, i) => s + i.q, 0);
  $('.bar').hidden = false; $('#tot').textContent = `${n} item(ns) · Total: ${brl(total())}${taxa() ? ' (com entrega)' : ''}`;
  $('#seguir').textContent = txtBotao; $('#seguir').disabled = false;
}

function vitrine() {
  $('#lista').innerHTML = `<div class="card hero"><h2>🛍️ Nossos produtos</h2><p>Escolha os produtos e as quantidades. Depois é só informar seus dados para enviar o pedido.</p></div>
  ${d.p.map((x, k) => `<div class="card item"><div class="pitem">${x.g && x.g.length ? `<div class="fotoBox" data-ver="${k}"><img src="${x.g[0]}" alt=""><span class="cnt">${x.g.length > 1 ? '🔍 ' + x.g.length + ' fotos' : '🔍 ver foto'}</span></div>` : ''}<div class="info">
    <div class="nm">${esc(x.n)}</div>${x.d ? `<div class="d">${esc(x.d)}</div>` : ''}<div class="pr">${brl(x.v)}</div>
    <span class="tag ${x.e ? '' : 'enc'}">${x.e ? 'Pronta entrega' : 'Sob encomenda'}</span>
    <div class="qtd"><button data-m="${x.id}" aria-label="Menos">−</button><b id="q_${x.id}">${S.q[x.id] || 0}</b><button data-p="${x.id}" aria-label="Mais">＋</button></div></div></div><div class="ads" id="ads_${x.id}"></div></div>`).join('') || '<div class="card vazio">Nenhum produto disponível no momento.</div>'}`;
  const muda = (id, dlt) => { S.q[id] = Math.max(0, Math.min(99, (S.q[id] || 0) + dlt)); $('#q_' + id).textContent = S.q[id]; desenhaAds(d.p.find(p => p.id === id)); barra('Continuar'); };
  d.p.forEach(desenhaAds);
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => muda(b.dataset.m, -1));
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => muda(b.dataset.p, 1));
  document.querySelectorAll('[data-ver]').forEach(f => f.onclick = () => galeria(d.p[+f.dataset.ver], 0));
  barra('Continuar');
  $('#seguir').onclick = () => { if (!itens().length) return alert('Escolha ao menos um produto.'); dados(); };
  window.scrollTo(0, 0);
}

// ofertas de um produto (dentro do cartão dele na vitrine)
function desenhaAds(p) {
  const box = $('#ads_' + p.id); if (!box) return;
  box.innerHTML = S.q[p.id] > 0 ? (p.ad || []).map(a => ofertaHtml(p, a)).join('') : '';
  ligaOfertas(box, () => { desenhaAds(p); barra('Continuar'); });
}
function ofertaHtml(p, a, comNome) {
  const k = chaveAd(p, a), q = S.ad[k] || 0;
  return `<div class="oferta ${q ? 'on' : ''}"><span>${q ? '✅' : '➕'} ${q ? 'Adicionado' : 'Adicione'} <b>${esc(a.n)}</b>${comNome ? ` <small>(${esc(p.n)})</small>` : ''} por apenas <b>${brl(a.v)}</b></span>
    ${q ? `<div class="qtd mini"><button data-adm="${k}">−</button><b>${q}</b><button data-adp="${k}">＋</button></div>` : `<button class="btn sm" data-adp="${k}">Adicionar</button>`}</div>`;
}
function ligaOfertas(box, depois) {
  box.querySelectorAll('[data-adp],[data-adm]').forEach(b => b.onclick = () => { const k = b.dataset.adp || b.dataset.adm; S.ad[k] = Math.max(0, Math.min(99, (S.ad[k] || 0) + (b.dataset.adp ? 1 : -1))); depois(); });
}
function resumo() {
  const tx = taxa(), falta = tx ? regra().minimo - subtotal() : 0;
  return `${itens().map(i => `<div class="row"><span>${i.q}× ${esc(i.x.n)}</span><b>${brl(i.x.v * i.q)}</b></div>`).join('')}
    ${S.receber === 'entrega' && S.cidade ? `<div class="row"><span>Entrega em ${esc(S.cidade)}</span><b>${tx ? brl(tx) : 'grátis'}</b></div>` : ''}
    <div class="total">Total: ${brl(total())}</div>
    ${tx && falta > 0 ? `<div class="s" style="color:var(--mut)">Faltam ${brl(falta)} para a entrega em ${esc(S.cidade)} sair grátis.</div>` : ''}`;
}
function dados(erro) {
  const opt = (v, t, sel) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${t}</option>`;
  $('#lista').innerHTML = `<button class="btn sec sm" id="volta" style="margin-bottom:10px">← Voltar aos produtos</button>
  <div class="card"><h3>Seu pedido</h3><div id="resumo">${resumo()}</div><div id="upsell"></div></div>
  <div class="card"><h3>Seus dados</h3>
    <label style="margin-top:0">Seu nome *</label><input id="nome" value="${esc(S.nome)}" autocomplete="name">
    <label>Telefone / WhatsApp *</label><input id="tel" inputmode="tel" value="${esc(S.tel)}" placeholder="(00) 00000-0000" autocomplete="tel">
    <label>Forma de pagamento *</label><select id="forma">${opt('', 'Escolha', S.forma)}${Object.entries(FORMAS).map(([k, t]) => opt(k, t, S.forma)).join('')}</select>
  </div>
  <div class="card"><h3>Como quer receber?</h3>
    <div class="tabs" style="margin:0"><button type="button" data-rec="entrega" class="${S.receber === 'entrega' ? 'on' : ''}">🚚 Entrega</button><button type="button" data-rec="retirada" class="${S.receber === 'retirada' ? 'on' : ''}">🏠 Retirada</button></div>
    <div id="boxEnt" ${S.receber === 'entrega' ? '' : 'hidden'}>
      <label>Cidade *</label><select id="cidade">${opt('', 'Escolha a cidade', S.cidade)}${ent().cidades.map(c => opt(c.nome, c.nome, S.cidade)).join('')}</select>
      <div class="s" style="color:var(--mut);margin-top:4px">${ent().cidades.map(c => `<b>${esc(c.nome)}:</b> ${txtRegra(c)}`).join('<br>')}${txtPrazo() ? '<br>' + txtPrazo() : ''}</div>
      <label>Endereço *</label><input id="end" value="${esc(S.end)}" placeholder="Rua, número, bairro" autocomplete="street-address">
    </div>
    <div id="boxRet" class="s" style="color:var(--mut);margin-top:10px" ${S.receber === 'retirada' ? '' : 'hidden'}>Combinamos o local e o horário da retirada pelo WhatsApp.</div>
    <label>Observações</label><textarea id="obs" rows="2" placeholder="Cor, personalização, data que precisa...">${esc(S.obs)}</textarea>
    ${erro ? `<div class="aviso bad" style="margin-top:10px">${esc(erro)}</div>` : ''}</div>`;
  const ler = () => { S.nome = $('#nome').value.trim(); S.tel = $('#tel').value.trim(); S.forma = $('#forma').value; S.cidade = $('#cidade').value; S.end = $('#end').value.trim(); S.obs = $('#obs').value.trim(); };
  const atual = () => { ler(); $('#resumo').innerHTML = resumo(); desenhaUpsell(); barra('Enviar pedido'); };
  const desenhaUpsell = () => {
    const falta = adsDisponiveis().filter(({ p, a }) => !S.ad[chaveAd(p, a)]);
    $('#upsell').innerHTML = falta.length ? '<div class="upsell"><b>✨ Aproveite e adicione:</b>' + falta.map(({ p, a }) => ofertaHtml(p, a, d.p.filter(x => S.q[x.id] > 0).length > 1)).join('') + '</div>' : '';
    ligaOfertas($('#upsell'), atual);
  };
  desenhaUpsell();
  $('#lista').oninput = $('#lista').onchange = atual;
  document.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
    S.receber = b.dataset.rec; document.querySelectorAll('[data-rec]').forEach(x => x.classList.toggle('on', x === b));
    $('#boxEnt').hidden = S.receber !== 'entrega'; $('#boxRet').hidden = S.receber !== 'retirada'; atual();
  });
  $('#volta').onclick = () => { ler(); vitrine(); };
  barra('Enviar pedido');
  $('#seguir').onclick = () => {
    ler();
    if (!S.nome) return dados('Informe seu nome.');
    if (S.tel.replace(/\D/g, '').length < 8) return dados('Informe um telefone para contato.');
    if (!S.forma) return dados('Escolha a forma de pagamento.');
    if (S.receber === 'entrega' && !S.cidade) return dados('Escolha a cidade da entrega.');
    if (S.receber === 'entrega' && S.end.length < 5) return dados('Informe o endereço da entrega.');
    enviar();
  };
  window.scrollTo(0, 0);
}

function textoWhats() {
  const receb = S.receber === 'entrega' ? `Entrega: ${S.end} - ${S.cidade}` : 'Vou retirar';
  return `Olá! Quero fazer um pedido 🛍️\n\nNome: ${S.nome}\nTelefone: ${S.tel}\nPagamento: ${FORMAS[S.forma] || ''}${S.forma === 'pix' && d.pix && d.pix.k ? ' (vou enviar o comprovante)' : ''}\n${receb}${S.obs ? '\nObs.: ' + S.obs : ''}\n\n` +
    itens().map(i => `• ${i.q}× ${i.x.n} - ${brl(i.x.v * i.q)}`).join('\n') + (taxa() ? `\nTaxa de entrega: ${brl(taxa())}` : '') + `\n\nTotal: ${brl(total())}`;
}
function linkWhats() { let n = String(d.w || '').replace(/\D/g, ''); if (n && n.length <= 11) n = '55' + n; return `https://wa.me/${n}?text=${encodeURIComponent(textoWhats())}`; }

async function enviar() {
  const b = $('#seguir'); b.disabled = true; b.textContent = 'Enviando...';
  const ent = S.receber === 'entrega';
  const dadosPed = { tipo: 'produtos', receber: S.receber, cidade: ent ? S.cidade : '', end: ent ? S.end : '', forma: S.forma, obs: S.obs.slice(0, 500), subtotal: subtotal(), taxa: taxa(), total: total(), itens: itens().map(i => ({ id: i.x.id, n: i.x.n, v: i.x.v, q: i.q, ...(i.x.ad === true ? { ad: true, arteId: i.x.arteId, adId: i.x.adId } : {}) })) };
  let mpLink = '', mpTotal = 0, gravado = false;
  // Cartão: a nuvem grava o pedido e cria o link do Mercado Pago com o valor conferido
  if (S.forma === 'credito' || S.forma === 'debito') {
    try {
      const r = await fetch(SUPA_URL + '/functions/v1/pagamento-cartao', { method: 'POST', headers: H, body: JSON.stringify({ nome: S.nome, tel: S.tel, forma: S.forma, receber: S.receber, cidade: dadosPed.cidade, end: dadosPed.end, obs: dadosPed.obs, itens: dadosPed.itens.map(i => ({ id: i.id, q: i.q })) }) });
      const j = await r.json().catch(() => ({}));
      if (j.pedidoId) gravado = true;
      if (r.ok && j.link) { mpLink = j.link; mpTotal = Number(j.total) || 0; } // valor conferido na nuvem
    } catch {}
  }
  try {
    if (!gravado) {
      const r = await fetch(SUPA_URL + '/rest/v1/pedidos', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ nome: S.nome.slice(0, 120), tel: S.tel.slice(0, 30), dados: dadosPed }) });
      if (!r.ok) throw 0;
    }
  } catch {
    b.disabled = false; b.textContent = 'Enviar pedido';
    if (d.w && confirm('Não foi possível enviar agora. Enviar pelo WhatsApp?')) location.href = linkWhats();
    return;
  }
  $('.bar').hidden = true;
  const pix = S.forma === 'pix' && d.pix && d.pix.k ? pixPayload({ chave: d.pix.k, nome: d.pix.n || d.n, cidade: d.pix.c, valor: total() }) : '';
  let qr = '';
  if (pix && typeof qrcode === 'function') { try { const q = qrcode(0, 'M'); q.addData(pix); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2 }); } catch {} }
  $('#lista').innerHTML = `<div class="card hero"><h2>🎉 Pedido recebido!</h2><p>Total: <b>${brl(total())}</b>${taxa() ? ` (com ${brl(taxa())} de entrega)` : ''} · ${esc(FORMAS[S.forma])} · ${S.receber === 'entrega' ? 'entrega em ' + esc(S.cidade) : 'retirada'}</p>${S.receber === 'entrega' && txtPrazo() ? `<p style="margin-top:6px">${txtPrazo()}</p>` : ''}</div>
  ${pix ? `<div class="card"><h3>💠 Pague com Pix</h3>
    <div class="s" style="color:var(--mut)">Valor: <b>${brl(total())}</b>${d.pix.n ? ` · Favorecido: <b>${esc(d.pix.n)}</b>` : ''}</div>
    ${qr ? `<div class="pixqr">${qr}</div>` : ''}
    <div class="s" style="margin:6px 0 4px">Pix Copia e Cola:</div><div class="pixcod" id="pixcod">${esc(pix)}</div>
    <button class="btn full" id="pixcp">📋 Copiar código Pix</button>
    <div class="s" style="color:var(--mut);margin-top:6px">No app do seu banco, escolha <b>Pix › Copia e Cola</b> e cole o código. Depois envie o pedido abaixo.</div></div>` : ''}
  ${mpLink ? `<div class="card"><h3>💳 Pague com cartão</h3>
    <div class="s" style="color:var(--mut)">Pagamento seguro pelo Mercado Pago, no crédito (com parcelamento) ou no débito. Valor: <b>${brl(mpTotal || total())}</b></div>
    <a class="btn full" href="${esc(mpLink)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;box-sizing:border-box">💳 Pagar ${brl(mpTotal || total())} com cartão</a>
    <div class="s" style="color:var(--mut);margin-top:6px">Abre em outra aba. Depois de pagar, volte aqui e envie o pedido abaixo.</div></div>`
  : (S.forma === 'credito' || S.forma === 'debito') ? '<div class="aviso">Não conseguimos gerar o link do cartão agora. Envie o pedido abaixo que a loja te manda o link de pagamento pelo WhatsApp.</div>' : ''}
  ${d.w ? `<button class="btn wa full" id="zap" style="font-size:1.05rem;padding:14px">📲 ENVIAR PEDIDO PARA LOJA</button>
  <div class="s" style="color:var(--mut);text-align:center;margin-top:6px">Abre o WhatsApp da loja com o seu pedido pronto. É só tocar em enviar.</div>` : ''}
  <button class="btn sec full" id="outro">Fazer outro pedido</button>`;
  if (pix) $('#pixcp').onclick = async () => { try { await navigator.clipboard.writeText(pix); $('#pixcp').textContent = '✅ Código copiado!'; } catch { prompt('Copie o código Pix:', pix); } };
  if (d.w) $('#zap').onclick = () => location.href = linkWhats();
  $('#outro').onclick = () => { S.q = {}; S.ad = {}; S.obs = ''; vitrine(); };
  window.scrollTo(0, 0);
}

function galeria(x, k) {
  const g = x.g || [], lb = $('#lb');
  lb.hidden = false;
  lb.innerHTML = `<button class="x" id="lbx">✕</button><img src="${g[k]}" alt=""><div class="nav">${g.length > 1 ? `<button id="lbp">‹</button><span>${k + 1} / ${g.length}</span><button id="lbn">›</button>` : ''}</div><div class="cap">${esc(x.n)}</div>`;
  $('#lbx').onclick = () => lb.hidden = true;
  if (g.length > 1) { $('#lbp').onclick = () => galeria(x, (k - 1 + g.length) % g.length); $('#lbn').onclick = () => galeria(x, (k + 1) % g.length); }
}

fetch(SUPA_URL + '/rest/v1/vitrine?select=data&id=eq.1', { headers: H }).then(r => r.json()).then(j => {
  d = j[0] && j[0].data;
  if (!d || !Array.isArray(d.p)) { $('#lista').innerHTML = '<div class="card vazio">O catálogo ainda não foi publicado. Volte daqui a pouco!</div>'; return; }
  if (d.n) { $('#tt').textContent = d.n; document.title = 'Produtos - ' + d.n; }
  vitrine();
  // Volta do Mercado Pago (back_urls da função pagamento-cartao)
  const mp = new URLSearchParams(location.search).get('mp');
  const aviso = { ok: ['', '✅ Pagamento aprovado! Obrigado pela compra. Se ainda não enviou o pedido pelo WhatsApp, fale com a gente.'], pendente: ['', '⏳ Pagamento em análise pelo Mercado Pago. Avisamos assim que for aprovado.'], erro: ['bad', 'O pagamento não foi concluído. Tente de novo ou escolha outra forma de pagamento.'] }[mp];
  if (aviso) $('#lista').insertAdjacentHTML('afterbegin', `<div class="aviso ${aviso[0]}">${aviso[1]}</div>`);
}).catch(() => { $('#lista').innerHTML = '<div class="card vazio">Não foi possível carregar os produtos. Verifique a internet e tente de novo.</div>'; });
