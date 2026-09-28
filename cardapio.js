'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FAIXAS = [10, 15, 20, 25];
const ICONE = { d: '🎪', f: '🎨', x: '🎁' };

function decode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))));
}
// Origem do cardápio: arquivo baixado (__D), link antigo com os dados no endereço (#d=) ou a vitrine na nuvem
const NUVEM = !window.__D && !location.hash.startsWith('#d=') && typeof SUPA_URL !== 'undefined';
const H = typeof SUPA_KEY !== 'undefined' ? { apikey: SUPA_KEY, 'Content-Type': 'application/json' } : {};
let d = null, semCardapio = false;
async function carregar() {
  if (NUVEM) {
    const r = await fetch(SUPA_URL + '/rest/v1/vitrine?select=data&id=eq.1', { headers: H });
    const j = await r.json(); if (r.ok && !j.length) semCardapio = true; return j[0] && j[0].data;
  }
  return window.__D || decode(location.hash.replace(/^#d=/, ''));
}

const S = { nome: '', tel: '', end: '', cri: '', data: '', sem: false, cat: '', sel: new Set() };
const modelo = x => (d.c.find(c => c.id === x.c) || {}).m || 'x';
// Preço do item conforme o nº de crianças escolhido no início
function preco(x) {
  if (modelo(x) === 'f') return S.cri === 'c' ? { v: 0, combinar: true } : { v: x.f[+S.cri] };
  return { v: x.v };
}
const txtPreco = x => { const p = preco(x); return p.combinar ? 'valor a combinar' : brl(p.v) + (modelo(x) === 'd' ? ' / diária' : ''); };
const txtCri = () => S.cri === 'c' ? 'mais de 25 crianças' : 'até ' + FAIXAS[+S.cri] + ' crianças';

function tela1(erro) {
  $('.bar').hidden = true;
  $('#tt').textContent = d.n || 'Monte sua festa';
  $('#lista').innerHTML = `<div class="card hero"><h2>🎈 Monte sua festa</h2><p>Conte um pouco sobre a festa e escolha o que quer ver.</p></div>
  <div class="card"><h3>Dados da festa</h3>
    <label style="margin-top:0">Seu nome *</label><input id="nome" value="${esc(S.nome)}" placeholder="Nome">
    <label>Telefone / WhatsApp *</label><input id="tel" inputmode="tel" value="${esc(S.tel)}" placeholder="(00) 00000-0000">
    <label>Endereço da festa</label><input id="end" value="${esc(S.end)}" placeholder="Rua, número, bairro">
    <label>Quantidade de crianças *</label><select id="cri"><option value="">Escolha</option>${FAIXAS.map((f, k) => `<option value="${k}" ${S.cri === String(k) ? 'selected' : ''}>Até ${f} crianças</option>`).join('')}<option value="c" ${S.cri === 'c' ? 'selected' : ''}>Mais de 25 crianças</option></select>
    <label>Data prevista</label><input type="date" id="data" value="${esc(S.data)}" ${S.sem ? 'disabled' : ''}>
    <div class="chk"><input type="checkbox" id="sem" ${S.sem ? 'checked' : ''}><label style="margin:0">Ainda não tenho data definida</label></div>
    ${erro ? `<div class="aviso bad" style="margin-top:10px">${esc(erro)}</div>` : ''}
  </div>
  <div class="card"><h3>O que você quer ver?</h3><div class="tiles">${d.c.map(c => `<button class="tile" data-cat="${c.id}"><span>${ICONE[c.m] || '🎁'}</span>${esc(c.n)}</button>`).join('')}</div></div>`;
  const ler = () => { S.nome = $('#nome').value.trim(); S.tel = $('#tel').value.trim(); S.end = $('#end').value.trim(); S.cri = $('#cri').value; S.sem = $('#sem').checked; S.data = $('#data').value; };
  $('#lista').oninput = $('#lista').onchange = () => { ler(); $('#data').disabled = S.sem; };
  document.querySelectorAll('.tile').forEach(b => b.onclick = () => {
    ler();
    if (!S.nome) return tela1('Informe seu nome.');
    if (!S.tel) return tela1('Informe um telefone para contato.');
    if (S.cri === '') return tela1('Escolha a quantidade de crianças.');
    if (!S.sem && !S.data) return tela1('Informe a data prevista ou marque "Ainda não tenho data".');
    S.cat = b.dataset.cat; tela2();
  });
}

function totais() {
  const its = [...S.sel].map(i => d.i[i]);
  return { its, total: its.reduce((a, x) => a + preco(x).v, 0), comb: its.some(x => preco(x).combinar) };
}
function tela2() {
  $('.bar').hidden = false;
  const itens = d.i.map((x, idx) => ({ x, idx })).filter(o => o.x.c === S.cat);
  $('#lista').innerHTML = `<button class="btn sec sm" id="volta" style="margin-bottom:10px">← Dados da festa</button>
  <div class="chips">${d.c.map(c => `<button data-cat="${c.id}" class="${c.id === S.cat ? 'on' : ''}">${esc(c.n)}</button>`).join('')}</div>
  ${itens.map(({ x, idx }) => `<div class="card item"><div class="pitem">${x.g && x.g.length ? `<div class="fotoBox" data-ver="${idx}"><img src="${x.g[0]}" alt=""><span class="cnt">${x.g.length > 1 ? '🔍 ' + x.g.length + ' fotos' : '🔍 ver foto'}</span></div>` : ''}<div class="info">
    <div class="nm">${esc(x.n)}</div>${x.d ? `<div class="d">${esc(x.d)}</div>` : ''}<div class="pr">${txtPreco(x)}</div>
    <label class="ck"><input type="checkbox" data-i="${idx}" ${S.sel.has(idx) ? 'checked' : ''}>Quero este item</label></div></div></div>`).join('') || '<div class="card vazio">Nenhum item nesta categoria</div>'}`;
  $('#volta').onclick = () => tela1();
  document.querySelectorAll('.chips [data-cat]').forEach(b => b.onclick = () => { S.cat = b.dataset.cat; tela2(); });
  document.querySelectorAll('[data-i]').forEach(c => c.onchange = () => { c.checked ? S.sel.add(+c.dataset.i) : S.sel.delete(+c.dataset.i); barra(); });
  document.querySelectorAll('[data-ver]').forEach(f => f.onclick = () => galeria(d.i[+f.dataset.ver], 0));
  barra();
}
function barra() { const t = totais(); $('#tot').textContent = `${t.its.length} item(ns) · Total: ${brl(t.total)}${t.comb ? ' + a combinar' : ''}`; }

function galeria(x, k) {
  const g = x.g || [], lb = $('#lb');
  lb.hidden = false;
  lb.innerHTML = `<button class="x" id="lbx">✕</button><img src="${g[k]}" alt=""><div class="nav">${g.length > 1 ? `<button id="lbp">‹</button><span>${k + 1} / ${g.length}</span><button id="lbn">›</button>` : ''}</div><div class="cap">${esc(x.n)}</div>`;
  $('#lbx').onclick = () => lb.hidden = true;
  if (g.length > 1) { $('#lbp').onclick = () => galeria(x, (k - 1 + g.length) % g.length); $('#lbn').onclick = () => galeria(x, (k + 1) % g.length); }
}

function textoWhats(t) {
  const porCat = d.c.map(c => ({ c, its: t.its.filter(x => x.c === c.id) })).filter(g => g.its.length);
  return `Olá! Quero um orçamento para a minha festa 🎉\n\nNome: ${S.nome}\nTelefone: ${S.tel}${S.end ? '\nEndereço: ' + S.end : ''}\nCrianças: ${txtCri()}\nData: ${S.sem ? 'ainda não definida' : S.data.split('-').reverse().join('/')}\n\n` +
      porCat.map(g => `*${g.c.n}*\n` + g.its.map(x => `• ${x.n} - ${txtPreco(x)}`).join('\n')).join('\n\n') + `\n\nTotal: ${brl(t.total)}${t.comb ? ' + itens a combinar' : ''}`;
}
function linkWhats(txt) { let n = String(d.w || '').replace(/\D/g, ''); if (n && n.length <= 11) n = '55' + n; return `https://wa.me/${n}?text=${encodeURIComponent(txt)}`; }
async function enviarPedido() {
  const t = totais(); if (!t.its.length) return alert('Marque ao menos um item.');
  if (!NUVEM) { location.href = linkWhats(textoWhats(t)); return; }
  const b = $('#enviar'); b.disabled = true; b.textContent = 'Enviando...';
  const dados = { end: S.end, cri: S.cri, data: S.sem ? '' : S.data, total: t.total, combinar: t.comb, itens: t.its.map(x => { const p = preco(x); return { id: x.id, n: x.n, v: p.v || 0, comb: !!p.combinar }; }) };
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/pedidos', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ nome: S.nome.slice(0, 120), tel: S.tel.slice(0, 30), dados }) });
    if (!r.ok) throw 0;
  } catch {
    b.disabled = false; b.textContent = 'Enviar pedido';
    if (confirm('Não foi possível enviar agora. Enviar pelo WhatsApp?')) location.href = linkWhats(textoWhats(t));
    return;
  }
  $('.bar').hidden = true;
  $('#lista').innerHTML = `<div class="card hero"><h2>🎉 Pedido enviado!</h2><p>Recebemos o seu pedido e vamos entrar em contato pelo telefone ${esc(S.tel)}.</p></div>
  ${d.w ? '<button class="btn wa full" id="zap">Falar agora pelo WhatsApp</button>' : ''}<button class="btn sec full" id="outro">Fazer outro pedido</button>`;
  if (d.w) $('#zap').onclick = () => location.href = linkWhats(textoWhats(t));
  $('#outro').onclick = () => { S.sel.clear(); tela1(); };
  window.scrollTo(0, 0);
}
carregar().then(x => { if (!x || !Array.isArray(x.i) || !Array.isArray(x.c)) throw 0; d = x; }).catch(() => {}).then(() => {
  if (!d) {
    $('#lista').innerHTML = `<div class="card vazio">${semCardapio ? 'O cardápio ainda não foi publicado. Volte daqui a pouco!' : NUVEM ? 'Não foi possível carregar o cardápio. Verifique a internet e tente de novo.' : 'Link inválido. Peça um novo cardápio à empresa.'}</div>`;
    $('.bar').hidden = true; return;
  }
  document.title = 'Cardápio - ' + (d.n || '');
  if (!NUVEM) { $('#enviar').textContent = 'Enviar pedido pelo WhatsApp'; $('#enviar').classList.add('wa'); }
  $('#enviar').onclick = enviarPedido;
  tela1();
});
