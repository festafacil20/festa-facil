'use strict';
/* Loja pública: o cliente escolhe produtos e envia o pedido (cai em Pedidos, no app de gestão) */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const H = { apikey: SUPA_KEY, 'Content-Type': 'application/json' };
let d = null;
const S = { q: {}, nome: '', tel: '', end: '', obs: '' };

const itens = () => d.p.filter(x => S.q[x.id] > 0).map(x => ({ x, q: S.q[x.id] }));
const total = () => itens().reduce((s, i) => s + i.x.v * i.q, 0);
function barra(txtBotao) {
  const n = itens().reduce((s, i) => s + i.q, 0);
  $('.bar').hidden = false; $('#tot').textContent = `${n} item(ns) · Total: ${brl(total())}`;
  $('#seguir').textContent = txtBotao;
}

function vitrine() {
  $('#lista').innerHTML = `<div class="card hero"><h2>🛍️ Nossos produtos</h2><p>Escolha os produtos e as quantidades. Depois é só informar seus dados para enviar o pedido.</p></div>
  ${d.p.map((x, k) => `<div class="card item"><div class="pitem">${x.g && x.g.length ? `<div class="fotoBox" data-ver="${k}"><img src="${x.g[0]}" alt=""><span class="cnt">${x.g.length > 1 ? '🔍 ' + x.g.length + ' fotos' : '🔍 ver foto'}</span></div>` : ''}<div class="info">
    <div class="nm">${esc(x.n)}</div>${x.d ? `<div class="d">${esc(x.d)}</div>` : ''}<div class="pr">${brl(x.v)}</div>
    <span class="tag ${x.e ? '' : 'enc'}">${x.e ? 'Pronta entrega' : 'Sob encomenda'}</span>
    <div class="qtd"><button data-m="${x.id}" aria-label="Menos">−</button><b id="q_${x.id}">${S.q[x.id] || 0}</b><button data-p="${x.id}" aria-label="Mais">＋</button></div></div></div></div>`).join('') || '<div class="card vazio">Nenhum produto disponível no momento.</div>'}`;
  const muda = (id, dlt) => { S.q[id] = Math.max(0, Math.min(99, (S.q[id] || 0) + dlt)); $('#q_' + id).textContent = S.q[id]; barra('Continuar'); };
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => muda(b.dataset.m, -1));
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => muda(b.dataset.p, 1));
  document.querySelectorAll('[data-ver]').forEach(f => f.onclick = () => galeria(d.p[+f.dataset.ver], 0));
  barra('Continuar');
  $('#seguir').onclick = () => { if (!itens().length) return alert('Escolha ao menos um produto.'); dados(); };
  window.scrollTo(0, 0);
}

function dados(erro) {
  $('#lista').innerHTML = `<button class="btn sec sm" id="volta" style="margin-bottom:10px">← Voltar aos produtos</button>
  <div class="card"><h3>Seu pedido</h3>${itens().map(i => `<div class="row"><span>${i.q}× ${esc(i.x.n)}</span><b>${brl(i.x.v * i.q)}</b></div>`).join('')}<div class="total">Total: ${brl(total())}</div></div>
  <div class="card"><h3>Seus dados</h3>
    <label style="margin-top:0">Seu nome *</label><input id="nome" value="${esc(S.nome)}" autocomplete="name">
    <label>Telefone / WhatsApp *</label><input id="tel" inputmode="tel" value="${esc(S.tel)}" placeholder="(00) 00000-0000" autocomplete="tel">
    <label>Endereço para entrega (deixe em branco para retirar)</label><input id="end" value="${esc(S.end)}" placeholder="Rua, número, bairro">
    <label>Observações</label><textarea id="obs" rows="2" placeholder="Cor, personalização, data que precisa...">${esc(S.obs)}</textarea>
    ${erro ? `<div class="aviso bad" style="margin-top:10px">${esc(erro)}</div>` : ''}</div>`;
  const ler = () => { S.nome = $('#nome').value.trim(); S.tel = $('#tel').value.trim(); S.end = $('#end').value.trim(); S.obs = $('#obs').value.trim(); };
  $('#lista').oninput = ler;
  $('#volta').onclick = () => { ler(); vitrine(); };
  barra('Enviar pedido');
  $('#seguir').onclick = () => {
    ler();
    if (!S.nome) return dados('Informe seu nome.');
    if (S.tel.replace(/\D/g, '').length < 8) return dados('Informe um telefone para contato.');
    enviar();
  };
  window.scrollTo(0, 0);
}

function textoWhats() {
  return `Olá! Quero fazer um pedido 🛍️\n\nNome: ${S.nome}\nTelefone: ${S.tel}\n${S.end ? 'Entrega: ' + S.end : 'Vou retirar'}${S.obs ? '\nObs.: ' + S.obs : ''}\n\n` +
    itens().map(i => `• ${i.q}× ${i.x.n} - ${brl(i.x.v * i.q)}`).join('\n') + `\n\nTotal: ${brl(total())}`;
}
function linkWhats() { let n = String(d.w || '').replace(/\D/g, ''); if (n && n.length <= 11) n = '55' + n; return `https://wa.me/${n}?text=${encodeURIComponent(textoWhats())}`; }

async function enviar() {
  const b = $('#seguir'); b.disabled = true; b.textContent = 'Enviando...';
  const dadosPed = { tipo: 'produtos', end: S.end, obs: S.obs.slice(0, 500), total: total(), itens: itens().map(i => ({ id: i.x.id, n: i.x.n, v: i.x.v, q: i.q })) };
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/pedidos', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ nome: S.nome.slice(0, 120), tel: S.tel.slice(0, 30), dados: dadosPed }) });
    if (!r.ok) throw 0;
  } catch {
    b.disabled = false; b.textContent = 'Enviar pedido';
    if (d.w && confirm('Não foi possível enviar agora. Enviar pelo WhatsApp?')) location.href = linkWhats();
    return;
  }
  $('.bar').hidden = true;
  $('#lista').innerHTML = `<div class="card hero"><h2>🎉 Pedido enviado!</h2><p>Recebemos o seu pedido e vamos entrar em contato pelo telefone ${esc(S.tel)} para combinar pagamento e ${S.end ? 'entrega' : 'retirada'}.</p></div>
  ${d.w ? '<button class="btn wa full" id="zap">Falar agora pelo WhatsApp</button>' : ''}<button class="btn sec full" id="outro">Fazer outro pedido</button>`;
  if (d.w) $('#zap').onclick = () => location.href = linkWhats();
  $('#outro').onclick = () => { S.q = {}; S.obs = ''; vitrine(); };
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
}).catch(() => { $('#lista').innerHTML = '<div class="card vazio">Não foi possível carregar os produtos. Verifique a internet e tente de novo.</div>'; });
