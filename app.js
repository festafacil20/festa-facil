'use strict';
/* ===== Banco de dados (localStorage) ===== */
const KEY = 'festafacil.v1';
const vazio = () => ({ clientes: [], brinquedos: [], oficinas: [], eventos: [], lancamentos: [], config: { nome: 'Festa Fácil', whats: '' } });
let db;
try { db = Object.assign(vazio(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { db = vazio(); }
const FAIXAS = [10, 15, 20, 25];
db.oficinas.forEach(o => { if (!o.faixas) { o.faixas = {}; FAIXAS.forEach(f => o.faixas[f] = { v: o.valor || 0, c: 0 }); } });
db.eventos.forEach(e => (e.itens || []).forEach(i => { if (i.t === 'o' && !i.fx) i.fx = '10'; }));
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => parseFloat(String(v).replace(',', '.')) || 0;
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => iso(new Date());
const fdata = s => s ? s.split('-').reverse().join('/') : '';
const by = (arr, id) => arr.find(x => x.id === id);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const STATUS = { orcamento: 'Orçamento', confirmado: 'Confirmado', realizado: 'Realizado', cancelado: 'Cancelado' };
const CATS_R = ['Sinal de evento', 'Pagamento de evento', 'Outros'];
const CATS_D = ['Material', 'Transporte', 'Funcionários', 'Manutenção', 'Marketing', 'Outros'];
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }

/* ===== Sheet modal ===== */
function sheet(titulo, html, onReady) {
  $('#sheetTitle').textContent = titulo; $('#sheetBody').innerHTML = html; $('#overlay').hidden = false;
  if (onReady) onReady($('#sheetBody'));
}
const fechar = () => $('#overlay').hidden = true;
$('#sheetClose').onclick = fechar;
$('#overlay').onclick = e => { if (e.target.id === 'overlay') fechar(); };

/* ===== Regras de negócio ===== */
function valorItem(i) {
  if (i.t === 'b') { const b = by(db.brinquedos, i.id); return b ? b.valor * i.q : 0; }
  if (i.fx === 'c') return i.vc || 0;
  const o = by(db.oficinas, i.id); return o && o.faixas[i.fx] ? o.faixas[i.fx].v : 0;
}
function custoItem(i) {
  if (i.t !== 'o') return 0;
  if (i.fx === 'c') return i.cc || 0;
  const o = by(db.oficinas, i.id); return o && o.faixas[i.fx] ? o.faixas[i.fx].c : 0;
}
const totalEvento = ev => (ev.itens || []).reduce((s, i) => s + valorItem(i), 0);
const custoEvento = ev => (ev.itens || []).reduce((s, i) => s + custoItem(i), 0);
// Reservas de um brinquedo em uma data (ignora cancelados e, opcionalmente, um evento)
function reservado(brId, data, ignorarEv) {
  return db.eventos.filter(e => e.data === data && e.status !== 'cancelado' && e.id !== ignorarEv)
    .reduce((s, e) => s + (e.itens || []).filter(i => i.t === 'b' && i.id === brId).reduce((a, i) => a + i.q, 0), 0);
}
function conflitos(ev) {
  const out = [];
  (ev.itens || []).filter(i => i.t === 'b' && i.q > 0).forEach(i => {
    const b = by(db.brinquedos, i.id); if (!b) return;
    const tot = reservado(i.id, ev.data, ev.id) + i.q;
    if (tot > b.estoque) out.push(`${b.nome}: ${tot} reservado(s) em ${fdata(ev.data)}, estoque de ${b.estoque}`);
  });
  return out;
}
function sincronizaSinal(ev) {
  const ex = db.lancamentos.find(l => l.eventoId === ev.id && l.origem === 'sinal');
  if (ev.sinal > 0 && ev.sinalPago && ev.status !== 'cancelado') {
    const cli = by(db.clientes, ev.clienteId);
    const l = { tipo: 'r', valor: ev.sinal, data: ex ? ex.data : hoje(), cat: 'Sinal de evento', desc: `Sinal - ${cli ? cli.nome : 'evento'} (${fdata(ev.data)})`, eventoId: ev.id, origem: 'sinal' };
    if (ex) Object.assign(ex, l); else db.lancamentos.push({ id: uid(), ...l });
  } else if (ex) db.lancamentos = db.lancamentos.filter(l => l !== ex);
}
function wa(tel, txt) {
  let n = String(tel || '').replace(/\D/g, ''); if (n && n.length <= 11) n = '55' + n;
  return `https://wa.me/${n}${txt ? '?text=' + encodeURIComponent(txt) : ''}`;
}

/* ===== Roteador ===== */
const rotas = { dashboard: viewDashboard, agenda: viewAgenda, clientes: viewClientes, catalogo: viewCatalogo, financeiro: viewFinanceiro, config: viewConfig };
const titulos = { dashboard: 'Início', agenda: 'Agenda', clientes: 'Clientes', catalogo: 'Catálogo', financeiro: 'Financeiro', config: 'Configurações' };
let rota = 'dashboard';
const st = { mes: new Date(), dia: hoje(), tab: 'b', busca: '', fmes: new Date() };
function ir(r) {
  rota = r; $('#titulo').textContent = r === 'dashboard' ? (db.config.nome || 'Festa Fácil') : titulos[r];
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.r === r));
  $('#btnAdd').hidden = !['agenda', 'clientes', 'catalogo', 'financeiro'].includes(r);
  render();
}
function render() { rotas[rota](); window.scrollTo(0, 0); }
$('#nav').onclick = e => { const b = e.target.closest('button'); if (b) ir(b.dataset.r); };
$('#btnAdd').onclick = () => {
  if (rota === 'agenda') formEvento(null, st.dia);
  else if (rota === 'clientes') formCliente();
  else if (rota === 'catalogo') formCatalogo(st.tab);
  else if (rota === 'financeiro') formLanc();
};
const app = $('#app');

/* ===== Dashboard ===== */
function somaMes(y, m) {
  let r = 0, d = 0;
  db.lancamentos.forEach(l => { const dt = new Date(l.data + 'T12:00'); if (dt.getFullYear() === y && dt.getMonth() === m) l.tipo === 'r' ? r += l.valor : d += l.valor; });
  return { r, d };
}
function viewDashboard() {
  const n = new Date(), { r, d } = somaMes(n.getFullYear(), n.getMonth());
  const avisos = [];
  const futuros = db.eventos.filter(e => e.data >= hoje() && e.status !== 'cancelado').sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  futuros.forEach(e => {
    const c = by(db.clientes, e.clienteId), nm = c ? c.nome : 'Cliente';
    if (e.sinal > 0 && !e.sinalPago) avisos.push({ bad: 0, t: `💵 Sinal de ${brl(e.sinal)} não cobrado: ${esc(nm)} (${fdata(e.data)})` });
    conflitos(e).forEach(t => avisos.push({ bad: 1, t: `⚠️ Conflito de estoque - ${esc(t)}` }));
  });
  const vistos = new Set();
  for (let i = avisos.length - 1; i >= 0; i--) { if (vistos.has(avisos[i].t)) avisos.splice(i, 1); else vistos.add(avisos[i].t); }
  const meses = [];
  for (let i = 5; i >= 0; i--) { const dt = new Date(n.getFullYear(), n.getMonth() - i, 1); meses.push({ l: MESES[dt.getMonth()].slice(0, 3), ...somaMes(dt.getFullYear(), dt.getMonth()) }); }
  const mx = Math.max(1, ...meses.flatMap(m => [m.r, m.d]));
  app.innerHTML = `
  <div class="grid3" style="margin-bottom:12px">
    <div class="kpi"><small>Receita</small><b class="pos">${brl(r)}</b></div>
    <div class="kpi"><small>Despesa</small><b class="neg">${brl(d)}</b></div>
    <div class="kpi"><small>Saldo</small><b class="${r - d >= 0 ? 'pos' : 'neg'}">${brl(r - d)}</b></div>
  </div>
  <div class="kpi" style="margin-bottom:12px"><small>Lucro previsto dos eventos do mês</small><b class="${lucroMes(n.getFullYear(), n.getMonth()).l >= 0 ? 'pos' : 'neg'}">${brl(lucroMes(n.getFullYear(), n.getMonth()).l)}</b></div>
  ${avisos.map(a => `<div class="aviso ${a.bad ? 'bad' : ''}">${a.t}</div>`).join('')}
  <div class="card"><h3>Últimos 6 meses</h3><div class="chart">${meses.map(m => `<div class="c"><div class="b"><i style="height:${m.r / mx * 100}%;background:var(--ok)"></i><i style="height:${m.d / mx * 100}%;background:var(--bad)"></i></div>${m.l}</div>`).join('')}</div>
  <div style="font-size:.7rem;color:var(--mut);margin-top:6px">🟩 receita &nbsp; 🟥 despesa</div></div>
  <div class="card"><h3>Próximos eventos</h3>${futuros.slice(0, 5).map(rowEvento).join('') || '<div class="vazio">Nenhum evento agendado</div>'}</div>`;
}
function rowEvento(e) {
  const c = by(db.clientes, e.clienteId);
  return `<div class="row" data-ev="${e.id}"><div><div class="t">${esc(c ? c.nome : 'Sem cliente')}</div><div class="s">${fdata(e.data)} ${esc(e.hora || '')} · ${esc(e.local || '')}</div></div><div style="text-align:right"><span class="badge">${STATUS[e.status]}</span><div class="s">${brl(totalEvento(e))}</div></div></div>`;
}
app.addEventListener('click', e => { const r = e.target.closest('[data-ev]'); if (r) formEvento(by(db.eventos, r.dataset.ev)); });

/* ===== Agenda ===== */
function viewAgenda() {
  const y = st.mes.getFullYear(), m = st.mes.getMonth(), prim = new Date(y, m, 1).getDay(), dias = new Date(y, m + 1, 0).getDate();
  const comEv = new Set(db.eventos.filter(e => e.status !== 'cancelado').map(e => e.data));
  let cel = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<div class="h">${d}</div>`).join('') + '<div></div>'.repeat(prim);
  for (let d = 1; d <= dias; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`;
    cel += `<div class="d ${k === hoje() ? 'hoje' : ''} ${k === st.dia ? 'sel' : ''} ${comEv.has(k) ? 'ev' : ''}" data-dia="${k}">${d}</div>`;
  }
  const lista = db.eventos.filter(e => e.data === st.dia).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
  app.innerHTML = `<div class="card"><div class="mes"><button id="mp">‹</button><b>${MESES[m]} ${y}</b><button id="mn">›</button></div><div class="cal">${cel}</div></div>
  <div class="card"><h3>${fdata(st.dia)}</h3>${lista.map(rowEvento).join('') || '<div class="vazio">Sem eventos neste dia</div>'}<button class="btn full" id="novoEv">＋ Novo evento</button></div>`;
  $('#mp').onclick = () => { st.mes = new Date(y, m - 1, 1); viewAgenda(); };
  $('#mn').onclick = () => { st.mes = new Date(y, m + 1, 1); viewAgenda(); };
  $('#novoEv').onclick = () => formEvento(null, st.dia);
  app.querySelectorAll('[data-dia]').forEach(el => el.onclick = () => { st.dia = el.dataset.dia; viewAgenda(); });
}
function formEvento(ev, data) {
  if (!db.clientes.length) { toast('Cadastre um cliente primeiro'); return ir('clientes'); }
  const novo = !ev;
  ev = ev || { id: uid(), clienteId: db.clientes[0].id, data: data || hoje(), hora: '14:00', local: '', itens: [], sinal: 0, sinalPago: false, status: 'confirmado', obs: '' };
  const qt = (t, id) => { const i = ev.itens.find(x => x.t === t && x.id === id); return i ? i.q : 0; };
  const linhas = (arr, t) => arr.map(o => `<div class="itemsel"><span>${esc(o.nome)} <small style="color:var(--mut)">${brl(o.valor)}</small></span><input type="number" min="0" inputmode="numeric" data-t="${t}" data-i="${o.id}" value="${qt(t, o.id)}"></div>`).join('') || '<div class="s" style="color:var(--mut)">Nenhum cadastrado</div>';
  const linhasOf = db.oficinas.map(o => { const it = ev.itens.find(x => x.t === 'o' && x.id === o.id), fx = it ? String(it.fx) : ''; return `<div class="oficina" data-o="${o.id}"><div class="itemsel"><span>${esc(o.nome)}</span><select data-fx style="width:auto;max-width:60%"><option value="">Não</option>${FAIXAS.map(f => `<option value="${f}" ${fx === String(f) ? 'selected' : ''}>Até ${f} crianças · ${brl(o.faixas[f].v)}</option>`).join('')}<option value="c" ${fx === 'c' ? 'selected' : ''}>Mais de 25 (a combinar)</option></select></div><div class="combo" ${fx === 'c' ? '' : 'hidden'}><input data-vc inputmode="decimal" placeholder="Valor combinado R$" value="${it && it.vc || ''}"><input data-cc inputmode="decimal" placeholder="Meu custo R$" value="${it && it.cc || ''}"></div></div>`; }).join('') || '<div class="s" style="color:var(--mut)">Nenhuma cadastrada</div>';
  sheet(novo ? 'Novo evento' : 'Evento', `
    <label>Cliente</label><select id="fc">${db.clientes.map(c => `<option value="${c.id}" ${c.id === ev.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
    <div style="display:flex;gap:8px"><div style="flex:1"><label>Data</label><input type="date" id="fd" value="${ev.data}"></div><div style="flex:1"><label>Hora</label><input type="time" id="fh" value="${ev.hora}"></div></div>
    <label>Local</label><input id="fl" value="${esc(ev.local)}" placeholder="Endereço / salão">
    <label>Brinquedos (quantidade)</label>${linhas(db.brinquedos, 'b')}
    <label>Oficinas (quantidade de crianças)</label>${linhasOf}
    <div class="total" id="ftot"></div><div id="favisos"></div>
    <label>Sinal (R$)</label><input id="fs" inputmode="decimal" value="${ev.sinal || ''}">
    <div class="chk"><input type="checkbox" id="fsp" ${ev.sinalPago ? 'checked' : ''}><label style="margin:0">Sinal já recebido (lança no financeiro)</label></div>
    <label>Status</label><select id="fst">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === ev.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label>Observações</label><textarea id="fo" rows="2">${esc(ev.obs)}</textarea>
    <button class="btn full" id="fsave">Salvar</button>
    ${novo ? '' : '<button class="btn wa full" id="fwa">WhatsApp do cliente</button><button class="btn del full" id="fdel">Excluir evento</button>'}`, b => {
    const ler = () => {
      const o = { ...ev, clienteId: $('#fc').value, data: $('#fd').value, hora: $('#fh').value, local: $('#fl').value.trim(), sinal: num($('#fs').value), sinalPago: $('#fsp').checked, status: $('#fst').value, obs: $('#fo').value.trim() };
      o.itens = [...b.querySelectorAll('[data-t]')].map(i => ({ t: i.dataset.t, id: i.dataset.i, q: Math.max(0, parseInt(i.value) || 0) })).filter(i => i.q > 0);
      b.querySelectorAll('.oficina').forEach(w => { const fx = w.querySelector('[data-fx]').value; if (!fx) return; const it = { t: 'o', id: w.dataset.o, fx, q: 1 }; if (fx === 'c') { it.vc = num(w.querySelector('[data-vc]').value); it.cc = num(w.querySelector('[data-cc]').value); } o.itens.push(it); });
      return o;
    };
    const atual = () => { const o = ler(); b.querySelectorAll('.oficina').forEach(w => w.querySelector('.combo').hidden = w.querySelector('[data-fx]').value !== 'c'); const tt = totalEvento(o), cc = custoEvento(o); $('#ftot').innerHTML = 'Total: ' + brl(tt) + (cc ? `<div class="s" style="font-weight:400">Custo ${brl(cc)} · Lucro <b class="${tt - cc >= 0 ? 'pos' : 'neg'}">${brl(tt - cc)}</b></div>` : ''); $('#favisos').innerHTML = o.status === 'cancelado' ? '' : conflitos(o).map(t => `<div class="aviso bad">⚠️ ${esc(t)}</div>`).join(''); };
    b.addEventListener('input', atual); atual();
    $('#fsave').onclick = () => {
      const o = ler(); if (!o.data) return toast('Informe a data');
      const cf = o.status === 'cancelado' ? [] : conflitos(o);
      if (cf.length && !confirm('Conflito de estoque:\n\n' + cf.join('\n') + '\n\nSalvar mesmo assim?')) return;
      if (novo) db.eventos.push(o); else Object.assign(by(db.eventos, ev.id), o);
      sincronizaSinal(o); save(); fechar(); st.dia = o.data; st.mes = new Date(o.data + 'T12:00'); render(); toast('Evento salvo');
    };
    if (!novo) {
      $('#fwa').onclick = () => { const c = by(db.clientes, ev.clienteId); const o = ler(); window.open(wa(c && c.tel, `Olá ${c ? c.nome : ''}! Sobre a festa do dia ${fdata(o.data)} às ${o.hora}. Total: ${brl(totalEvento(o))}.`), '_blank'); };
      $('#fdel').onclick = () => { if (!confirm('Excluir este evento?')) return; db.eventos = db.eventos.filter(e => e.id !== ev.id); db.lancamentos = db.lancamentos.filter(l => l.eventoId !== ev.id); save(); fechar(); render(); };
    }
  });
}

/* ===== Clientes ===== */
function viewClientes() {
  const lista = db.clientes.filter(c => (c.nome + (c.tel || '')).toLowerCase().includes(st.busca.toLowerCase())).sort((a, b) => a.nome.localeCompare(b.nome));
  app.innerHTML = `<input id="busca" placeholder="🔍 Buscar cliente" value="${esc(st.busca)}" style="margin-bottom:12px"><div class="card">${lista.map(c => `<div class="row" data-cli="${c.id}"><div><div class="t">${esc(c.nome)}</div><div class="s">${esc(c.tel || '')} · ${db.eventos.filter(e => e.clienteId === c.id).length} evento(s)</div></div>›</div>`).join('') || '<div class="vazio">Nenhum cliente</div>'}</div>`;
  $('#busca').oninput = e => { st.busca = e.target.value; const p = e.target.selectionStart; viewClientes(); const i = $('#busca'); i.focus(); i.setSelectionRange(p, p); };
  app.querySelectorAll('[data-cli]').forEach(r => r.onclick = () => formCliente(by(db.clientes, r.dataset.cli)));
}
function formCliente(c) {
  const novo = !c; c = c || { id: uid(), nome: '', tel: '', obs: '' };
  const hist = db.eventos.filter(e => e.clienteId === c.id).sort((a, b) => b.data.localeCompare(a.data));
  sheet(novo ? 'Novo cliente' : 'Cliente', `
    <label>Nome</label><input id="cn" value="${esc(c.nome)}">
    <label>WhatsApp (com DDD)</label><input id="ct" inputmode="tel" value="${esc(c.tel)}">
    <label>Observações</label><textarea id="co" rows="2">${esc(c.obs)}</textarea>
    <button class="btn full" id="csave">Salvar</button>
    ${novo ? '' : `<button class="btn wa full" id="cwa">Abrir WhatsApp</button>
    <h3 style="margin-top:16px">Histórico</h3>${hist.map(e => `<div class="row"><div><div class="t">${fdata(e.data)}</div><div class="s">${esc(e.local || '')}</div></div><div>${brl(totalEvento(e))} <span class="badge">${STATUS[e.status]}</span></div></div>`).join('') || '<div class="vazio">Sem eventos</div>'}
    <button class="btn del full" id="cdel">Excluir cliente</button>`}`, () => {
    $('#csave').onclick = () => {
      const n = $('#cn').value.trim(); if (!n) return toast('Informe o nome');
      Object.assign(c, { nome: n, tel: $('#ct').value.trim(), obs: $('#co').value.trim() });
      if (novo) db.clientes.push(c); save(); fechar(); render(); toast('Cliente salvo');
    };
    if (!novo) {
      $('#cwa').onclick = () => window.open(wa(c.tel), '_blank');
      $('#cdel').onclick = () => { if (db.eventos.some(e => e.clienteId === c.id)) return toast('Cliente tem eventos; exclua-os antes'); if (!confirm('Excluir cliente?')) return; db.clientes = db.clientes.filter(x => x.id !== c.id); save(); fechar(); render(); };
    }
  });
}

/* ===== Catálogo: brinquedos e oficinas ===== */
function menorPreco(o) { return Math.min(...FAIXAS.map(f => o.faixas[f].v)); }
function viewCatalogo() {
  const arr = st.tab === 'b' ? db.brinquedos : db.oficinas;
  const thumb = o => o.img ? `<img src="${o.img}" class="thumb">` : '<div class="thumb ph">📷</div>';
  app.innerHTML = `<div class="tabs"><button data-tab="b" class="${st.tab === 'b' ? 'on' : ''}">🎪 Brinquedos</button><button data-tab="o" class="${st.tab === 'o' ? 'on' : ''}">🎨 Oficinas</button></div>
  <div class="card">${arr.map(o => `<div class="row" data-cat="${o.id}">${thumb(o)}<div style="flex:1"><div class="t">${esc(o.nome)}</div><div class="s">${st.tab === 'b' ? 'Estoque: ' + o.estoque : 'Custo a partir de ' + brl(Math.min(...FAIXAS.map(f => o.faixas[f].c)))}</div></div><b>${st.tab === 'b' ? brl(o.valor) : 'a partir de ' + brl(menorPreco(o))}</b></div>`).join('') || '<div class="vazio">Nada cadastrado</div>'}</div>
  <button class="btn full" id="novoCat">＋ Adicionar</button>
  <button class="btn sec full" id="linkCard">🔗 Gerar cardápio para clientes</button>`;
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; viewCatalogo(); });
  app.querySelectorAll('[data-cat]').forEach(r => r.onclick = () => formCatalogo(st.tab, by(arr, r.dataset.cat)));
  $('#novoCat').onclick = () => formCatalogo(st.tab);
  $('#linkCard').onclick = gerarCardapio;
}
function lerImagem(file, cb) {
  const fr = new FileReader();
  fr.onload = () => { const im = new Image(); im.onload = () => {
    const k = Math.min(1, 640 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    cb(c.toDataURL('image/jpeg', 0.72)); }; im.src = fr.result; };
  fr.readAsDataURL(file);
}
function formCatalogo(tipo, o) {
  const novo = !o, isB = tipo === 'b';
  o = o || (isB ? { id: uid(), nome: '', valor: 0, estoque: 1, desc: '', img: '' } : { id: uid(), nome: '', desc: '', img: '', faixas: Object.fromEntries(FAIXAS.map(f => [f, { v: 0, c: 0 }])) });
  let img = o.img || '';
  const fx = isB ? `<label>Valor da diária (R$)</label><input id="ov" inputmode="decimal" value="${o.valor || ''}">
    <label>Quantidade em estoque</label><input id="oe" type="number" min="1" inputmode="numeric" value="${o.estoque}">`
    : `<label>Preço para o cliente e meu custo (R$)</label><div class="faixas"><b></b><b>Preço</b><b>Meu custo</b>${FAIXAS.map(f => `<span>Até ${f} crianças</span><input inputmode="decimal" data-fv="${f}" value="${o.faixas[f].v || ''}"><input inputmode="decimal" data-fc="${f}" value="${o.faixas[f].c || ''}">`).join('')}</div>
    <div class="s" style="color:var(--mut);margin-top:6px">Mais de 25 crianças: valor a combinar (informado em cada evento).</div>`;
  sheet((novo ? 'Novo ' : 'Editar ') + (isB ? 'brinquedo' : 'oficina'), `
    <label>Nome</label><input id="on" value="${esc(o.nome)}">
    <label>Descrição (aparece no cardápio)</label><textarea id="od" rows="3">${esc(o.desc)}</textarea>
    <label>Foto</label><div id="oimg"></div><input type="file" id="of" accept="image/*" hidden>
    <button class="btn sec sm" id="ofb" type="button">📷 Escolher foto</button> <button class="btn del sm" id="ofx" type="button">Remover</button>
    ${fx}
    <button class="btn full" id="osave">Salvar</button>${novo ? '' : '<button class="btn del full" id="odel">Excluir</button>'}`, () => {
    const pv = () => { $('#oimg').innerHTML = img ? `<img src="${img}" style="max-width:100%;max-height:180px;border-radius:10px;margin-bottom:8px">` : ''; $('#ofx').hidden = !img; };
    pv();
    $('#ofb').onclick = () => $('#of').click();
    $('#of').onchange = e => { if (e.target.files[0]) lerImagem(e.target.files[0], d => { img = d; pv(); }); };
    $('#ofx').onclick = () => { img = ''; pv(); };
    $('#osave').onclick = () => {
      const n = $('#on').value.trim(); if (!n) return toast('Informe o nome');
      const bak = JSON.stringify(o);
      Object.assign(o, { nome: n, desc: $('#od').value.trim(), img });
      if (isB) { o.valor = num($('#ov').value); o.estoque = Math.max(1, parseInt($('#oe').value) || 1); }
      else FAIXAS.forEach(f => o.faixas[f] = { v: num(document.querySelector(`[data-fv="${f}"]`).value), c: num(document.querySelector(`[data-fc="${f}"]`).value) });
      const arr = isB ? db.brinquedos : db.oficinas; if (novo) arr.push(o);
      try { save(); } catch { if (novo) arr.pop(); else Object.assign(o, JSON.parse(bak)); return toast('Sem espaço: use foto menor ou faça backup'); }
      fechar(); st.tab = tipo; if (rota === 'catalogo') render(); toast('Salvo');
    };
    if (!novo) $('#odel').onclick = () => { if (!confirm('Excluir?')) return; if (isB) db.brinquedos = db.brinquedos.filter(x => x.id !== o.id); else db.oficinas = db.oficinas.filter(x => x.id !== o.id); save(); fechar(); render(); };
  });
}
function b64(obj) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function dadosCardapio(comFotos) {
  const item = (t, x) => { const r = { t, n: x.nome, d: x.desc || '' }; if (comFotos && x.img) r.g = x.img; if (t === 'b') r.v = x.valor; else r.f = FAIXAS.map(f => x.faixas[f].v); return r; };
  return { n: db.config.nome, w: db.config.whats, i: [...db.brinquedos.map(b => item('b', b)), ...db.oficinas.map(o => item('o', o))] };
}
async function htmlCardapio() {
  {
    const [h, j, c] = await Promise.all(['cardapio.html', 'cardapio.js', 'style.css'].map(u => fetch(u).then(r => r.text())));
    const dados = JSON.stringify(dadosCardapio(true)).replace(/</g, '\\u003c');
    const html = h.replace('<link rel="stylesheet" href="style.css">', () => '<style>' + c + '</style>').replace('<script src="cardapio.js"></' + 'script>', () => '<script>window.__D=' + dados + ';</' + 'script><script>' + j + '</' + 'script>');
    return new Blob([html], { type: 'text/html' });
  }
}
async function baixarCardapio() {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(await htmlCardapio()); a.download = 'cardapio-festa.html'; a.click(); } catch { toast('Não foi possível gerar o arquivo'); }
}
async function previaCardapio() {
  try { window.open(URL.createObjectURL(await htmlCardapio()), '_blank'); } catch { toast('Não foi possível abrir a pré-visualização'); }
}
function gerarCardapio() {
  if (!db.config.whats) { toast('Informe o WhatsApp em Configurações'); return ir('config'); }
  const dados = dadosCardapio(false);
  if (!dados.i.length) return toast('Cadastre brinquedos ou oficinas antes');
  const link = new URL('cardapio.html', location.href).href.split('#')[0] + '#d=' + b64(dados);
  sheet('Cardápio para clientes', `<p><b>Link</b> (leve, com nomes, descrições e preços; sem fotos):</p><div class="linkbox">${esc(link)}</div>
    <button class="btn full" id="lcp">Copiar link</button><button class="btn wa full" id="lsh">Enviar link por WhatsApp</button><button class="btn sec full" id="lpv">Pré-visualizar (com fotos)</button>
    <p style="margin-top:16px"><b>Arquivo com fotos:</b> baixe e envie o arquivo pelo WhatsApp; o cliente abre no celular.</p><button class="btn sec full" id="lfx">⬇️ Baixar cardápio com fotos</button>`, () => {
    $('#lcp').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { prompt('Copie o link:', link); } };
    $('#lsh').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent('Monte sua festa aqui: ' + link), '_blank');
    $('#lpv').onclick = previaCardapio;
    $('#lfx').onclick = baixarCardapio;
  });
}

/* ===== Financeiro ===== */
function lucroMes(y, m) {
  const evs = db.eventos.filter(e => { const d = new Date(e.data + 'T12:00'); return d.getFullYear() === y && d.getMonth() === m && e.status !== 'cancelado' && e.status !== 'orcamento'; });
  const v = evs.reduce((s, e) => s + totalEvento(e), 0), c = evs.reduce((s, e) => s + custoEvento(e), 0);
  return { n: evs.length, v, c, l: v - c };
}
function viewFinanceiro() {
  const y = st.fmes.getFullYear(), m = st.fmes.getMonth();
  const ls = db.lancamentos.filter(l => { const d = new Date(l.data + 'T12:00'); return d.getFullYear() === y && d.getMonth() === m; }).sort((a, b) => b.data.localeCompare(a.data));
  const r = ls.filter(l => l.tipo === 'r').reduce((s, l) => s + l.valor, 0), d = ls.filter(l => l.tipo === 'd').reduce((s, l) => s + l.valor, 0);
  const porCat = {}; ls.forEach(l => { const k = (l.tipo === 'r' ? '+ ' : '− ') + l.cat; porCat[k] = (porCat[k] || 0) + l.valor; });
  app.innerHTML = `<div class="mes"><button id="fp">‹</button><b>${MESES[m]} ${y}</b><button id="fn">›</button></div>
  <div class="grid3" style="margin-bottom:12px"><div class="kpi"><small>Receita</small><b class="pos">${brl(r)}</b></div><div class="kpi"><small>Despesa</small><b class="neg">${brl(d)}</b></div><div class="kpi"><small>Saldo</small><b class="${r - d >= 0 ? 'pos' : 'neg'}">${brl(r - d)}</b></div></div>
  ${(() => { const L = lucroMes(y, m); return `<div class="card"><h3>Lucro dos eventos (${L.n})</h3><div class="row"><span>Faturamento previsto</span><b>${brl(L.v)}</b></div><div class="row"><span>Custo das oficinas</span><b class="neg">${brl(L.c)}</b></div><div class="row"><span><b>Lucro</b></span><b class="${L.l >= 0 ? 'pos' : 'neg'}">${brl(L.l)}</b></div><div class="s" style="color:var(--mut)">Eventos confirmados/realizados do mês (sem orçamentos e cancelados)</div></div>`; })()}
  ${Object.keys(porCat).length ? `<div class="card"><h3>Por categoria</h3>${Object.entries(porCat).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${brl(v)}</b></div>`).join('')}</div>` : ''}
  <div class="card"><h3>Lançamentos</h3>${ls.map(l => `<div class="row" data-l="${l.id}"><div><div class="t">${esc(l.desc || l.cat)}</div><div class="s">${fdata(l.data)} · ${esc(l.cat)}</div></div><b class="${l.tipo === 'r' ? 'pos' : 'neg'}">${l.tipo === 'r' ? '+' : '−'}${brl(l.valor)}</b></div>`).join('') || '<div class="vazio">Sem lançamentos</div>'}</div>`;
  $('#fp').onclick = () => { st.fmes = new Date(y, m - 1, 1); viewFinanceiro(); };
  $('#fn').onclick = () => { st.fmes = new Date(y, m + 1, 1); viewFinanceiro(); };
  app.querySelectorAll('[data-l]').forEach(el => el.onclick = () => formLanc(by(db.lancamentos, el.dataset.l)));
}
function formLanc(l) {
  const novo = !l; l = l || { id: uid(), tipo: 'r', valor: 0, data: hoje(), cat: CATS_R[0], desc: '' };
  const cats = t => (t === 'r' ? CATS_R : CATS_D).map(c => `<option ${c === l.cat ? 'selected' : ''}>${c}</option>`).join('');
  sheet(novo ? 'Novo lançamento' : 'Lançamento', `
    <div class="tabs" style="margin-top:10px"><button data-t="r" class="${l.tipo === 'r' ? 'on' : ''}">Receita</button><button data-t="d" class="${l.tipo === 'd' ? 'on' : ''}">Despesa</button></div>
    <label>Valor (R$)</label><input id="lv" inputmode="decimal" value="${l.valor || ''}">
    <label>Data</label><input type="date" id="ld" value="${l.data}">
    <label>Categoria</label><select id="lc">${cats(l.tipo)}</select>
    <label>Descrição</label><input id="lde" value="${esc(l.desc)}">
    <button class="btn full" id="lsave">Salvar</button>${novo ? '' : '<button class="btn del full" id="ldel">Excluir</button>'}`, b => {
    b.querySelectorAll('[data-t]').forEach(t => t.onclick = () => { l.tipo = t.dataset.t; b.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === t)); l.cat = (l.tipo === 'r' ? CATS_R : CATS_D)[0]; $('#lc').innerHTML = cats(l.tipo); });
    $('#lsave').onclick = () => {
      const v = num($('#lv').value); if (v <= 0) return toast('Informe o valor');
      Object.assign(l, { valor: v, data: $('#ld').value || hoje(), cat: $('#lc').value, desc: $('#lde').value.trim() });
      if (novo) db.lancamentos.push(l); save(); fechar(); render(); toast('Lançamento salvo');
    };
    if (!novo) $('#ldel').onclick = () => { if (!confirm('Excluir lançamento?')) return; db.lancamentos = db.lancamentos.filter(x => x.id !== l.id); save(); fechar(); render(); };
  });
}

/* ===== Configurações ===== */
function viewConfig() {
  app.innerHTML = `<div class="card"><h3>Empresa</h3><label>Nome da empresa</label><input id="cfn" value="${esc(db.config.nome)}">
  <label>WhatsApp da empresa (com DDD) — recebe os pedidos do cardápio</label><input id="cfw" inputmode="tel" value="${esc(db.config.whats)}">
  <button class="btn full" id="cfs">Salvar</button></div>
  <div class="card"><h3>Backup</h3><p class="s" style="color:var(--mut);margin-top:0">Os dados ficam só neste aparelho. Faça backup com frequência.</p>
  <button class="btn sec full" id="bx">⬇️ Exportar backup</button><button class="btn sec full" id="bi">⬆️ Importar backup</button><input type="file" id="bf" accept="application/json" hidden></div>
  <div class="card"><h3>Zona de perigo</h3><button class="btn del full" id="apagar">Apagar todos os dados</button></div>`;
  $('#cfs').onclick = () => { db.config.nome = $('#cfn').value.trim() || 'Festa Fácil'; db.config.whats = $('#cfw').value.trim(); save(); toast('Salvo'); };
  $('#bx').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' })); a.download = `festa-facil-backup-${hoje()}.json`; a.click(); };
  $('#bi').onclick = () => $('#bf').click();
  $('#bf').onchange = async e => {
    try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.eventos) || !j.config) throw 0; if (!confirm('Substituir todos os dados atuais pelo backup?')) return; db = Object.assign(vazio(), j); save(); toast('Backup importado'); ir('dashboard'); } catch { toast('Arquivo inválido'); }
  };
  $('#apagar').onclick = () => { if (confirm('Apagar TODOS os dados? Isso não pode ser desfeito.') && confirm('Tem certeza? Exporte um backup antes se precisar.')) { db = vazio(); save(); ir('dashboard'); toast('Dados apagados'); } };
}

/* ===== Início ===== */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
ir('dashboard');
