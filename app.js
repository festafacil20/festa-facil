'use strict';
/* ===== Banco de dados (localStorage) ===== */
const KEY = 'festafacil.v1'; // não renomear: é onde os dados já estão guardados nos aparelhos
const VERSAO = '19'; // manter igual ao número em sw.js (marizekids-v19)
const FAIXAS = [10, 15, 20, 25];
const CATS_PADRAO = () => [{ id: 'c_brinq', nome: 'Brinquedos', m: 'd' }, { id: 'c_ofic', nome: 'Oficinas', m: 'f' }, { id: 'c_pac', nome: 'Pacotes', m: 'x' }];
const MODELOS = { d: 'Diária com estoque (ex.: brinquedos)', f: 'Preço por nº de crianças (ex.: oficinas)', x: 'Preço fixo (ex.: pacotes)' };
const vazio = () => ({ clientes: [], eventos: [], lancamentos: [], categorias: CATS_PADRAO(), catalogo: [], pcats: [], produtos: [], compras: [], movs: [], kits: [], artes: [], pmovs: [], vendas: [], config: { nome: 'Marize Kids', whats: '' } });
let db;
try { db = Object.assign(vazio(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { db = vazio(); }
// Traz dados de versões anteriores (brinquedos/oficinas separados) para o catálogo único
function migrar() {
  const b = vazio(); for (const k in b) if (db[k] === undefined) db[k] = b[k];
  const fv = v => Object.fromEntries(FAIXAS.map(f => [f, { v: v || 0, c: 0 }]));
  (db.brinquedos || []).forEach(x => db.catalogo.push({ id: x.id, cat: 'c_brinq', nome: x.nome, desc: x.desc || '', imgs: x.img ? [x.img] : [], valor: x.valor || 0, estoque: x.estoque || 1 }));
  (db.oficinas || []).forEach(x => db.catalogo.push({ id: x.id, cat: 'c_ofic', nome: x.nome, desc: x.desc || '', imgs: x.img ? [x.img] : [], faixas: x.faixas || fv(x.valor) }));
  delete db.brinquedos; delete db.oficinas;
  if (db.config.nome === 'Festa Fácil') db.config.nome = 'Marize Kids'; // nome antigo da empresa
  db.catalogo.forEach(x => { if (x.img) { x.imgs = [x.img]; delete x.img; } if (!x.imgs) x.imgs = []; });
  db.eventos.forEach(e => (e.itens || []).forEach(i => { if (i.t === 'o' && !i.fx) i.fx = '10'; delete i.t; }));
}
migrar();
const save = () => { localStorage.setItem(KEY, JSON.stringify(db)); nuvemAgendar(); };
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
const FORMAS = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
const FORMAS_ALL = { ...FORMAS, credito: 'Cartão de crédito', debito: 'Cartão de débito', boleto: 'Boleto', outro: 'Outro' };
const CATS_R = ['Sinal de evento', 'Pagamento de evento', 'Venda de produtos', 'Outros'];
const CATS_D = ['Material', 'Transporte', 'Funcionários', 'Manutenção', 'Marketing', 'Outros'];
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }
const optsForma = (v, lista = FORMAS) => '<option value="">Forma: não informada</option>' + Object.entries(lista).map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('');

/* ===== Sheet modal ===== */
function sheet(titulo, html, onReady) {
  const velho = $('#sheetBody'), novo = velho.cloneNode(false); velho.replaceWith(novo); // descarta ouvintes do formulário anterior
  $('#sheetTitle').textContent = titulo; novo.innerHTML = html; $('#overlay').hidden = false;
  if (onReady) onReady($('#sheetBody'));
}
const fechar = () => $('#overlay').hidden = true;
$('#sheetClose').onclick = fechar;
$('#overlay').onclick = e => { if (e.target.id === 'overlay') fechar(); };

/* ===== Regras de negócio ===== */
const cit = id => by(db.catalogo, id);
const mod = it => { const c = it && by(db.categorias, it.cat); return c ? c.m : 'x'; };
const faixaV = (it, f) => (it.faixas && it.faixas[f] && it.faixas[f].v) || 0;
const faixaC = (it, f) => (it.faixas && it.faixas[f] && it.faixas[f].c) || 0;
function valorItem(i) {
  const it = cit(i.id); if (!it) return 0;
  const m = mod(it);
  if (m === 'f') return i.fx === 'c' ? (i.vc || 0) : faixaV(it, i.fx);
  return (it.valor || 0) * i.q;
}
function custoItem(i) {
  const it = cit(i.id); if (!it) return 0;
  const m = mod(it);
  if (m === 'f') return i.fx === 'c' ? (i.cc || 0) : faixaC(it, i.fx);
  if (m === 'x') return (it.custo || 0) * i.q;
  return 0;
}
const totalEvento = ev => (ev.itens || []).reduce((s, i) => s + valorItem(i), 0);
const custoEvento = ev => (ev.itens || []).reduce((s, i) => s + custoItem(i), 0);
const restoEvento = ev => Math.max(0, totalEvento(ev) - (ev.sinal || 0));
// Reservas de um brinquedo em uma data (ignora cancelados e, opcionalmente, um evento)
function reservado(itId, data, ignorarEv) {
  return db.eventos.filter(e => e.data === data && e.status !== 'cancelado' && e.id !== ignorarEv)
    .reduce((s, e) => s + (e.itens || []).filter(i => i.id === itId).reduce((a, i) => a + i.q, 0), 0);
}
function conflitos(ev) {
  const out = [];
  (ev.itens || []).filter(i => i.q > 0).forEach(i => {
    const it = cit(i.id); if (!it || mod(it) !== 'd') return;
    const tot = reservado(i.id, ev.data, ev.id) + i.q;
    if (tot > it.estoque) out.push(`${it.nome}: ${tot} reservado(s) em ${fdata(ev.data)}, estoque de ${it.estoque}`);
  });
  return out;
}
// Sinal e restante viram lançamentos de receita quando marcados como recebidos
function sincronizaPagamentos(ev) {
  const cli = by(db.clientes, ev.clienteId), nm = cli ? cli.nome : 'evento';
  const um = (origem, valor, forma, cat, rotulo) => {
    const ex = db.lancamentos.find(l => l.eventoId === ev.id && l.origem === origem);
    if (valor > 0 && ev[origem + 'Pago'] && ev.status !== 'cancelado') {
      const l = { tipo: 'r', valor, data: ex ? ex.data : hoje(), cat, desc: `${rotulo} - ${nm} (${fdata(ev.data)})`, forma: forma || '', eventoId: ev.id, origem };
      if (ex) Object.assign(ex, l); else db.lancamentos.push({ id: uid(), ...l });
    } else if (ex) db.lancamentos = db.lancamentos.filter(l => l !== ex);
  };
  um('sinal', ev.sinal || 0, ev.sinalForma, 'Sinal de evento', 'Sinal');
  um('resto', restoEvento(ev), ev.restoForma, 'Pagamento de evento', 'Restante');
}
function wa(tel, txt) {
  let n = String(tel || '').replace(/\D/g, ''); if (n && n.length <= 11) n = '55' + n;
  return `https://wa.me/${n}${txt ? '?text=' + encodeURIComponent(txt) : ''}`;
}

/* ===== Roteador ===== */
const rotas = { dashboard: () => viewDashboard(), agenda: () => viewAgenda(), clientes: () => viewClientes(), catalogo: () => viewCatalogo(), financeiro: () => viewFinanceiro(), estoque: () => viewEstoque(), vendas: () => viewVendas(), relatorios: () => viewRelatorios(), config: () => viewConfig() };
const titulos = { dashboard: 'Início', agenda: 'Agenda', clientes: 'Clientes', catalogo: 'Catálogo', financeiro: 'Financeiro', estoque: 'Estoque', vendas: 'Vendas', relatorios: 'Relatórios', config: 'Configurações' };
let rota = 'dashboard';
const st = { mes: new Date(), dia: hoje(), cat: '', busca: '', fmes: new Date(), et: 'produtos', pcat: '' };
function ir(r) {
  rota = r; $('#titulo').textContent = r === 'dashboard' ? (db.config.nome || 'Marize Kids') : titulos[r];
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.r === r));
  $('#btnAdd').hidden = !['agenda', 'clientes', 'catalogo', 'financeiro', 'estoque', 'vendas'].includes(r);
  render();
}
function render() { rotas[rota](); window.scrollTo(0, 0); }
$('#nav').onclick = e => { const b = e.target.closest('button'); if (b) ir(b.dataset.r); };
$('#btnAdd').onclick = () => {
  if (rota === 'agenda') formEvento(null, st.dia);
  else if (rota === 'clientes') formCliente();
  else if (rota === 'catalogo') formCatalogo(st.cat);
  else if (rota === 'financeiro') formLanc();
  else if (rota === 'estoque') (st.et === 'kits' ? formKit() : formProduto());
  else if (rota === 'vendas') (st.vt === 'artes' ? formArte() : formVenda());
};
$('#btnCfg').onclick = () => ir('config');
const app = $('#app');

/* ===== Dashboard ===== */
function somaMes(y, m) {
  let r = 0, d = 0;
  db.lancamentos.forEach(l => { const dt = new Date(l.data + 'T12:00'); if (dt.getFullYear() === y && dt.getMonth() === m) l.tipo === 'r' ? r += l.valor : d += l.valor; });
  return { r, d };
}
function lucroMes(y, m) {
  const evs = db.eventos.filter(e => { const d = new Date(e.data + 'T12:00'); return d.getFullYear() === y && d.getMonth() === m && e.status !== 'cancelado' && e.status !== 'orcamento'; });
  const v = evs.reduce((s, e) => s + totalEvento(e), 0), c = evs.reduce((s, e) => s + custoEvento(e), 0);
  return { n: evs.length, v, c, l: v - c };
}
function viewDashboard() {
  const n = new Date(), { r, d } = somaMes(n.getFullYear(), n.getMonth()), L = lucroMes(n.getFullYear(), n.getMonth());
  const avisos = [];
  const ativos = db.eventos.filter(e => e.status !== 'cancelado');
  const futuros = ativos.filter(e => e.data >= hoje()).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const nomeCli = e => { const c = by(db.clientes, e.clienteId); return c ? c.nome : 'Cliente'; };
  futuros.forEach(e => {
    if (e.sinal > 0 && !e.sinalPago) avisos.push({ bad: 0, t: `💵 Sinal de ${brl(e.sinal)} não cobrado: ${esc(nomeCli(e))} (${fdata(e.data)})` });
    conflitos(e).forEach(t => avisos.push({ bad: 1, t: `⚠️ Conflito de estoque - ${esc(t)}` }));
  });
  ativos.filter(e => e.data < hoje() && e.status !== 'orcamento' && restoEvento(e) > 0 && !e.restoPago).forEach(e => avisos.push({ bad: 0, t: `💰 Restante de ${brl(restoEvento(e))} a receber: ${esc(nomeCli(e))} (${fdata(e.data)})` }));
  avisosEstoque().forEach(t => avisos.push({ bad: 0, t }));
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
  <div class="kpi" style="margin-bottom:12px"><small>Lucro previsto dos eventos do mês</small><b class="${L.l >= 0 ? 'pos' : 'neg'}">${brl(L.l)}</b></div>
  <div id="dpeds"></div>
  ${avisos.map(a => `<div class="aviso ${a.bad ? 'bad' : ''}">${a.t}</div>`).join('')}
  <div class="card"><h3>Últimos 6 meses</h3><div class="chart">${meses.map(m => `<div class="c"><div class="b"><i style="height:${m.r / mx * 100}%;background:var(--ok)"></i><i style="height:${m.d / mx * 100}%;background:var(--bad)"></i></div>${m.l}</div>`).join('')}</div>
  <div style="font-size:.7rem;color:var(--mut);margin-top:6px">🟩 receita &nbsp; 🟥 despesa</div></div>
  <div class="card"><h3>Próximos eventos</h3>${futuros.slice(0, 5).map(rowEvento).join('') || '<div class="vazio">Nenhum evento agendado</div>'}</div>`;
  contarPedidos($('#dpeds'));
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
function linhaItemEvento(it, ev) {
  const c = by(db.categorias, it.cat), m = mod(it), sel = ev.itens.find(x => x.id === it.id);
  let ctl = '', extra = '', preco = '';
  if (m === 'f') {
    const fx = sel ? String(sel.fx) : '';
    preco = 'a partir de ' + brl(Math.min(...FAIXAS.map(f => faixaV(it, f))));
    ctl = `<select data-fx style="width:auto;max-width:58%"><option value="">Não</option>${FAIXAS.map(f => `<option value="${f}" ${fx === String(f) ? 'selected' : ''}>Até ${f} crianças · ${brl(faixaV(it, f))}</option>`).join('')}<option value="c" ${fx === 'c' ? 'selected' : ''}>Mais de 25 (a combinar)</option></select>`;
    extra = `<div class="combo" ${fx === 'c' ? '' : 'hidden'}><input data-vc inputmode="decimal" placeholder="Valor combinado R$" value="${sel && sel.vc || ''}"><input data-cc inputmode="decimal" placeholder="Meu custo R$" value="${sel && sel.cc || ''}"></div>`;
  } else {
    preco = brl(it.valor) + (m === 'd' ? ' / diária' : '');
    ctl = `<input type="number" min="0" inputmode="numeric" data-q value="${sel ? sel.q : 0}">`;
  }
  return `<div class="it" data-id="${it.id}" data-cat="${it.cat}" data-m="${m}" data-nome="${esc(it.nome.toLowerCase())}"><div class="itemsel"><span>${esc(it.nome)}<br><small style="color:var(--mut)">${esc(c ? c.nome : '')} · ${preco}</small></span>${ctl}</div>${extra}</div>`;
}
function formEvento(ev, data) {
  if (!db.clientes.length) { toast('Cadastre um cliente primeiro'); return ir('clientes'); }
  const novo = !ev;
  ev = ev || { id: uid(), clienteId: db.clientes[0].id, data: data || hoje(), hora: '14:00', local: '', itens: [], sinal: 0, sinalForma: '', sinalPago: false, restoForma: '', restoPago: false, status: 'confirmado', obs: '' };
  sheet(novo ? 'Novo evento' : 'Evento', `
    <label>Cliente</label><select id="fc">${db.clientes.map(c => `<option value="${c.id}" ${c.id === ev.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
    <div style="display:flex;gap:8px"><div style="flex:1"><label>Data</label><input type="date" id="fd" value="${ev.data}"></div><div style="flex:1"><label>Hora</label><input type="time" id="fh" value="${ev.hora}"></div></div>
    <label>Local</label><input id="fl" value="${esc(ev.local)}" placeholder="Endereço / salão">
    <label>Itens do evento</label>
    <input id="fbusca" placeholder="🔍 Buscar item pelo nome">
    <div class="chips" id="fchips"><button type="button" data-fc="" class="on">Todos</button>${db.categorias.map(c => `<button type="button" data-fc="${c.id}">${esc(c.nome)}</button>`).join('')}<button type="button" data-fc="_sel">✔ Marcados</button></div>
    <div id="fitens">${db.catalogo.map(it => linhaItemEvento(it, ev)).join('') || '<div class="s" style="color:var(--mut)">Catálogo vazio</div>'}</div>
    <div class="total" id="ftot"></div><div id="favisos"></div>
    ${novo ? '' : '<div id="fkitsBox"></div>'}
    <h3 style="margin:16px 0 0">Pagamento</h3>
    <label>Sinal / entrada (R$)</label><input id="fs" inputmode="decimal" value="${ev.sinal || ''}">
    <select id="fsf" style="margin-top:6px">${optsForma(ev.sinalForma)}</select>
    <div class="chk"><input type="checkbox" id="fsp" ${ev.sinalPago ? 'checked' : ''}><label style="margin:0">Sinal já recebido (lança no financeiro)</label></div>
    <label>Restante <b id="fresto"></b></label>
    <select id="frf">${optsForma(ev.restoForma)}</select>
    <div class="chk"><input type="checkbox" id="frp" ${ev.restoPago ? 'checked' : ''}><label style="margin:0">Restante já recebido (lança no financeiro)</label></div>
    <label>Status</label><select id="fst">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === ev.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label>Observações</label><textarea id="fo" rows="2">${esc(ev.obs)}</textarea>
    <button class="btn full" id="fsave">Salvar</button>
    ${novo ? '' : '<button class="btn wa full" id="fwa">WhatsApp do cliente</button><button class="btn del full" id="fdel">Excluir evento</button>'}`, b => {
    const ler = () => {
      const o = { ...ev, clienteId: $('#fc').value, data: $('#fd').value, hora: $('#fh').value, local: $('#fl').value.trim(), sinal: num($('#fs').value), sinalForma: $('#fsf').value, sinalPago: $('#fsp').checked, restoForma: $('#frf').value, restoPago: $('#frp').checked, status: $('#fst').value, obs: $('#fo').value.trim() };
      o.itens = [];
      b.querySelectorAll('.it').forEach(w => {
        const id = w.dataset.id;
        if (w.dataset.m === 'f') {
          const fx = w.querySelector('[data-fx]').value; if (!fx) return;
          const it = { id, fx, q: 1 }; if (fx === 'c') { it.vc = num(w.querySelector('[data-vc]').value); it.cc = num(w.querySelector('[data-cc]').value); }
          o.itens.push(it);
        } else { const q = Math.max(0, parseInt(w.querySelector('[data-q]').value) || 0); if (q) o.itens.push({ id, q }); }
      });
      return o;
    };
    const atual = () => {
      const o = ler(); b.querySelectorAll('.it[data-m="f"]').forEach(w => w.querySelector('.combo').hidden = w.querySelector('[data-fx]').value !== 'c');
      const tt = totalEvento(o), cc = custoEvento(o);
      $('#ftot').innerHTML = 'Total: ' + brl(tt) + (cc ? `<div class="s" style="font-weight:400">Custo ${brl(cc)} · Lucro <b class="${tt - cc >= 0 ? 'pos' : 'neg'}">${brl(tt - cc)}</b></div>` : '');
      $('#fresto').textContent = '· ' + brl(restoEvento(o));
      $('#favisos').innerHTML = o.status === 'cancelado' ? '' : conflitos(o).map(t => `<div class="aviso bad">⚠️ ${esc(t)}</div>`).join('');
    };
    let fcat = '';
    const marcado = w => w.dataset.m === 'f' ? !!w.querySelector('[data-fx]').value : (parseInt(w.querySelector('[data-q]').value) || 0) > 0;
    const filtra = () => {
      const q = $('#fbusca').value.trim().toLowerCase();
      b.querySelectorAll('.it').forEach(w => { w.hidden = !((!fcat || (fcat === '_sel' ? marcado(w) : w.dataset.cat === fcat)) && w.dataset.nome.includes(q)); });
    };
    b.addEventListener('input', atual); b.addEventListener('change', atual); atual();
    if (!novo) desenhaKitsEvento(ev, $('#fkitsBox'));
    $('#fbusca').addEventListener('input', filtra);
    $('#fchips').onclick = e => { const t = e.target.closest('[data-fc]'); if (!t) return; fcat = t.dataset.fc; b.querySelectorAll('#fchips button').forEach(x => x.classList.toggle('on', x === t)); filtra(); };
    $('#fsave').onclick = () => {
      const o = ler(); if (!o.data) return toast('Informe a data');
      const cf = o.status === 'cancelado' ? [] : conflitos(o);
      if (cf.length && !confirm('Conflito de estoque:\n\n' + cf.join('\n') + '\n\nSalvar mesmo assim?')) return;
      if (novo) db.eventos.push(o); else Object.assign(by(db.eventos, ev.id), o);
      sincronizaPagamentos(o); save(); fechar(); st.dia = o.data; st.mes = new Date(o.data + 'T12:00'); render(); toast('Evento salvo');
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

/* ===== Catálogo: categorias e itens ===== */
function lerImagem(file, cb) {
  const fr = new FileReader();
  fr.onload = () => { const im = new Image(); im.onload = () => {
    const k = Math.min(1, 640 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    cb(c.toDataURL('image/jpeg', 0.72)); }; im.src = fr.result; };
  fr.readAsDataURL(file);
}
function viewCatalogo() {
  if (!by(db.categorias, st.cat)) st.cat = db.categorias.length ? db.categorias[0].id : '';
  const cat = by(db.categorias, st.cat), m = cat && cat.m;
  const arr = db.catalogo.filter(x => x.cat === st.cat);
  const thumb = o => o.imgs[0] ? `<img src="${o.imgs[0]}" class="thumb">` : '<div class="thumb ph">📷</div>';
  const sub = o => m === 'd' ? 'Estoque: ' + o.estoque : m === 'f' ? 'Custo a partir de ' + brl(Math.min(...FAIXAS.map(f => faixaC(o, f)))) : (o.custo ? 'Custo ' + brl(o.custo) : '') + (o.imgs.length ? ` · ${o.imgs.length} foto(s)` : '');
  const preco = o => m === 'f' ? 'a partir de ' + brl(Math.min(...FAIXAS.map(f => faixaV(o, f)))) : brl(o.valor);
  app.innerHTML = `<div class="chips">${db.categorias.map(c => `<button data-tab="${c.id}" class="${c.id === st.cat ? 'on' : ''}">${esc(c.nome)}</button>`).join('')}<button id="novaCat" class="add">＋ Categoria</button></div>
  ${cat ? `<div class="card">${arr.map(o => `<div class="row" data-cat="${o.id}">${thumb(o)}<div style="flex:1"><div class="t">${esc(o.nome)}</div><div class="s">${sub(o)}</div></div><b>${preco(o)}</b></div>`).join('') || '<div class="vazio">Nada nesta categoria</div>'}</div>
  <button class="btn full" id="novoCat">＋ Adicionar em ${esc(cat.nome)}</button>
  <button class="btn sec full" id="edCat">✎ Editar categoria “${esc(cat.nome)}”</button>` : '<div class="vazio">Crie uma categoria para começar</div>'}
  <button class="btn sec full" id="linkCard">🔗 Link de festas para clientes</button>`;
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.cat = b.dataset.tab; viewCatalogo(); });
  app.querySelectorAll('[data-cat]').forEach(r => r.onclick = () => formCatalogo(st.cat, by(db.catalogo, r.dataset.cat)));
  $('#novaCat').onclick = () => formCategoria();
  if (cat) { $('#novoCat').onclick = () => formCatalogo(st.cat); $('#edCat').onclick = () => formCategoria(cat); }
  $('#linkCard').onclick = gerarCardapio;
}
function formCategoria(c) {
  const novo = !c; c = c || { id: uid(), nome: '', m: 'x' };
  const qtd = db.catalogo.filter(x => x.cat === c.id).length;
  sheet(novo ? 'Nova categoria' : 'Editar categoria', `
    <label>Nome da categoria</label><input id="gn" value="${esc(c.nome)}" placeholder="Ex.: Pacotes, Decoração, Buffet">
    <label>Como os itens são cobrados</label>
    ${novo ? `<select id="gm">${Object.entries(MODELOS).map(([k, t]) => `<option value="${k}" ${k === c.m ? 'selected' : ''}>${t}</option>`).join('')}</select>` : `<div class="s" style="color:var(--mut)">${MODELOS[c.m]} (não dá para mudar depois de criada)</div>`}
    <button class="btn full" id="gsave">Salvar</button>${novo ? '' : '<button class="btn del full" id="gdel">Excluir categoria</button>'}`, () => {
    $('#gsave').onclick = () => {
      const n = $('#gn').value.trim(); if (!n) return toast('Informe o nome');
      c.nome = n; if (novo) { c.m = $('#gm').value; db.categorias.push(c); }
      save(); fechar(); st.cat = c.id; if (rota === 'catalogo') render(); toast('Categoria salva');
    };
    if (!novo) $('#gdel').onclick = () => { if (qtd) return toast('Categoria tem itens; exclua ou mova os itens antes'); if (!confirm('Excluir categoria?')) return; db.categorias = db.categorias.filter(x => x.id !== c.id); save(); fechar(); render(); };
  });
}
function formCatalogo(catId, o) {
  const cat = by(db.categorias, catId || (o && o.cat)); if (!cat) { toast('Crie uma categoria primeiro'); return formCategoria(); }
  const novo = !o, m = cat.m;
  o = o || { id: uid(), cat: cat.id, nome: '', desc: '', imgs: [], valor: 0, estoque: 1, custo: 0, faixas: Object.fromEntries(FAIXAS.map(f => [f, { v: 0, c: 0 }])) };
  if (!o.faixas) o.faixas = Object.fromEntries(FAIXAS.map(f => [f, { v: 0, c: 0 }]));
  let imgs = [...o.imgs];
  const campos = m === 'd' ? `<label>Valor da diária (R$)</label><input id="ov" inputmode="decimal" value="${o.valor || ''}">
      <label>Quantidade em estoque</label><input id="oe" type="number" min="1" inputmode="numeric" value="${o.estoque || 1}">`
    : m === 'x' ? `<label>Valor (R$)</label><input id="ov" inputmode="decimal" value="${o.valor || ''}">
      <label>Meu custo (R$, opcional)</label><input id="oc" inputmode="decimal" value="${o.custo || ''}">`
    : `<label>Preço para o cliente e meu custo (R$)</label><div class="faixas"><b></b><b>Preço</b><b>Meu custo</b>${FAIXAS.map(f => `<span>Até ${f} crianças</span><input inputmode="decimal" data-fv="${f}" value="${faixaV(o, f) || ''}"><input inputmode="decimal" data-fc="${f}" value="${faixaC(o, f) || ''}">`).join('')}</div>
      <div class="s" style="color:var(--mut);margin-top:6px">Mais de 25 crianças: valor a combinar (informado em cada evento).</div>`;
  sheet((novo ? 'Novo item · ' : 'Editar · ') + cat.nome, `
    <label>Nome</label><input id="on" value="${esc(o.nome)}">
    <label>Descrição (aparece no cardápio)</label><textarea id="od" rows="3">${esc(o.desc)}</textarea>
    <label>Fotos (até 5)</label><div id="oimg" class="fotos"></div><input type="file" id="of" accept="image/*" multiple hidden>
    <button class="btn sec sm" id="ofb" type="button">📷 Adicionar fotos</button>
    ${campos}
    <button class="btn full" id="osave">Salvar</button>${novo ? '' : '<button class="btn del full" id="odel">Excluir</button>'}`, () => {
    const pv = () => { $('#oimg').innerHTML = imgs.map((s, k) => `<span class="ph1"><img src="${s}"><button type="button" data-rm="${k}">✕</button></span>`).join(''); };
    pv();
    $('#oimg').onclick = e => { const r = e.target.closest('[data-rm]'); if (r) { imgs.splice(+r.dataset.rm, 1); pv(); } };
    $('#ofb').onclick = () => $('#of').click();
    $('#of').onchange = async e => {
      for (const f of e.target.files) { if (imgs.length >= 5) break; await new Promise(r => lerImagem(f, d => { imgs.push(d); r(); })); }
      e.target.value = ''; pv();
    };
    $('#osave').onclick = () => {
      const n = $('#on').value.trim(); if (!n) return toast('Informe o nome');
      const bak = JSON.stringify(o);
      Object.assign(o, { nome: n, desc: $('#od').value.trim(), imgs: [...imgs] });
      if (m === 'd') { o.valor = num($('#ov').value); o.estoque = Math.max(1, parseInt($('#oe').value) || 1); }
      else if (m === 'x') { o.valor = num($('#ov').value); o.custo = num($('#oc').value); }
      else FAIXAS.forEach(f => o.faixas[f] = { v: num(document.querySelector(`[data-fv="${f}"]`).value), c: num(document.querySelector(`[data-fc="${f}"]`).value) });
      if (novo) db.catalogo.push(o);
      try { save(); } catch { if (novo) db.catalogo.pop(); else Object.assign(o, JSON.parse(bak)); return toast('Sem espaço: use menos fotos ou faça backup'); }
      fechar(); st.cat = cat.id; if (rota === 'catalogo') render(); toast('Salvo');
    };
    if (!novo) $('#odel').onclick = () => { if (!confirm('Excluir?')) return; db.catalogo = db.catalogo.filter(x => x.id !== o.id); save(); fechar(); render(); };
  });
}
function b64(obj) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function dadosCardapio(comFotos) {
  const item = (x, m) => { const r = { id: x.id, c: x.cat, n: x.nome, d: x.desc || '' }; if (comFotos && x.imgs.length) r.g = x.imgs; if (m === 'f') r.f = FAIXAS.map(f => faixaV(x, f)); else r.v = x.valor || 0; return r; };
  const prod = a => { const r = { id: a.id, n: a.nome, d: a.desc || '', v: a.preco || 0, e: saldoArte(a) > 0 }; if (comFotos && (a.imgs || []).length) r.g = a.imgs; return r; };
  return { n: db.config.nome, w: db.config.whats, c: db.categorias.map(c => ({ id: c.id, n: c.nome, m: c.m })), i: db.catalogo.map(x => item(x, mod(x))), p: db.artes.filter(a => a.loja !== false).map(prod), pix: db.config.pixChave ? { k: pixChave(db.config.pixChave, db.config.pixTipo), n: db.config.pixNome || '', c: db.config.pixCidade || '' } : null };
}
async function htmlCardapio() {
  const [h, j, c] = await Promise.all(['cardapio.html', 'cardapio.js', 'style.css'].map(u => fetch(u).then(r => r.text())));
  const dados = JSON.stringify(dadosCardapio(true)).replace(/</g, '\\u003c');
  const html = h.replace('<script src="config.js"></' + 'script>', '').replace('<link rel="stylesheet" href="style.css">', () => '<style>' + c + '</style>').replace('<script src="cardapio.js"></' + 'script>', () => '<script>window.__D=' + dados + ';</' + 'script><script>' + j + '</' + 'script>');
  return new Blob([html], { type: 'text/html' });
}
async function baixarCardapio() {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(await htmlCardapio()); a.download = 'cardapio-festa.html'; a.click(); } catch { toast('Não foi possível gerar o arquivo'); }
}
async function previaCardapio() {
  try { window.open(URL.createObjectURL(await htmlCardapio()), '_blank'); } catch { toast('Não foi possível abrir a pré-visualização'); }
}
function gerarCardapio() {
  if (!db.config.whats) { toast('Informe o WhatsApp em Configurações'); return ir('config'); }
  if (!db.catalogo.length) return toast('Cadastre itens no catálogo antes');
  const link = new URL('cardapio.html', location.href).href.split('#')[0];
  sheet('Link de festas', `<p>Este é o link fixo do cardápio de festas (brinquedos, oficinas e pacotes). O cliente escolhe os itens e o pedido chega em <b>Início › Pedidos do cardápio</b>. O que você muda no catálogo aparece na hora, sem gerar outro link.</p><div class="linkbox">${esc(link)}</div>
    <button class="btn full" id="lcp">Copiar link</button><button class="btn wa full" id="lsh">Enviar link por WhatsApp</button><button class="btn sec full" id="lpv">Abrir a página</button>
    <p style="margin-top:16px"><b>Arquivo com fotos</b> (para quem não abre links): baixe e envie o arquivo pelo WhatsApp.</p><button class="btn sec full" id="lfx">⬇️ Baixar cardápio com fotos</button>`, () => {
    $('#lcp').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { prompt('Copie o link:', link); } };
    $('#lsh').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent('Monte sua festa aqui: ' + link), '_blank');
    $('#lpv').onclick = () => window.open(link, '_blank');
    $('#lfx').onclick = baixarCardapio;
  });
}

function gerarLoja() {
  if (!db.artes.some(a => a.loja !== false)) { st.vt = 'artes'; ir('vendas'); return toast('Cadastre produtos em Vendas › Artes / produtos'); }
  const link = new URL('loja.html', location.href).href.split('#')[0];
  sheet('Link da loja de produtos', `<p>Envie este link para os clientes. Eles escolhem os produtos e o pedido chega em <b>Início › Pedidos</b>. Preços, fotos e produtos novos aparecem na hora.</p><div class="linkbox">${esc(link)}</div>
    <button class="btn full" id="jcp">Copiar link</button><button class="btn wa full" id="jsh">Enviar link por WhatsApp</button><button class="btn sec full" id="jpv">Abrir a loja</button>`, () => {
    $('#jcp').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { prompt('Copie o link:', link); } };
    $('#jsh').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent('Veja nossos produtos e faça seu pedido: ' + link), '_blank');
    $('#jpv').onclick = () => window.open(link, '_blank');
  });
}

/* ===== Financeiro ===== */
function viewFinanceiro() {
  const y = st.fmes.getFullYear(), m = st.fmes.getMonth();
  const ls = db.lancamentos.filter(l => { const d = new Date(l.data + 'T12:00'); return d.getFullYear() === y && d.getMonth() === m; }).sort((a, b) => b.data.localeCompare(a.data));
  const r = ls.filter(l => l.tipo === 'r').reduce((s, l) => s + l.valor, 0), d = ls.filter(l => l.tipo === 'd').reduce((s, l) => s + l.valor, 0);
  const porCat = {}; ls.forEach(l => { const k = (l.tipo === 'r' ? '+ ' : '− ') + l.cat; porCat[k] = (porCat[k] || 0) + l.valor; });
  const L = lucroMes(y, m);
  app.innerHTML = `<button class="btn sec full" id="brel" style="margin:0 0 12px">📊 Relatórios, gráficos e exportação (Excel/PDF)</button><div class="mes"><button id="fp">‹</button><b>${MESES[m]} ${y}</b><button id="fn">›</button></div>
  <div class="grid3" style="margin-bottom:12px"><div class="kpi"><small>Receita</small><b class="pos">${brl(r)}</b></div><div class="kpi"><small>Despesa</small><b class="neg">${brl(d)}</b></div><div class="kpi"><small>Saldo</small><b class="${r - d >= 0 ? 'pos' : 'neg'}">${brl(r - d)}</b></div></div>
  <div class="card"><h3>Lucro dos eventos (${L.n})</h3><div class="row"><span>Faturamento previsto</span><b>${brl(L.v)}</b></div><div class="row"><span>Custo dos itens</span><b class="neg">${brl(L.c)}</b></div><div class="row"><span><b>Lucro</b></span><b class="${L.l >= 0 ? 'pos' : 'neg'}">${brl(L.l)}</b></div><div class="s" style="color:var(--mut)">Eventos confirmados/realizados do mês (sem orçamentos e cancelados)</div></div>
  ${Object.keys(porCat).length ? `<div class="card"><h3>Por categoria</h3>${Object.entries(porCat).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${brl(v)}</b></div>`).join('')}</div>` : ''}
  <div class="card"><h3>Lançamentos</h3>${ls.map(l => `<div class="row" data-l="${l.id}"><div><div class="t">${esc(l.desc || l.cat)}</div><div class="s">${fdata(l.data)} · ${esc(l.cat)}${l.forma ? ' · ' + esc(FORMAS_ALL[l.forma] || l.forma) : ''}</div></div><b class="${l.tipo === 'r' ? 'pos' : 'neg'}">${l.tipo === 'r' ? '+' : '−'}${brl(l.valor)}</b></div>`).join('') || '<div class="vazio">Sem lançamentos</div>'}</div>`;
  $('#brel').onclick = () => ir('relatorios');
  $('#fp').onclick = () => { st.fmes = new Date(y, m - 1, 1); viewFinanceiro(); };
  $('#fn').onclick = () => { st.fmes = new Date(y, m + 1, 1); viewFinanceiro(); };
  app.querySelectorAll('[data-l]').forEach(el => el.onclick = () => formLanc(by(db.lancamentos, el.dataset.l)));
}
function formLanc(l) {
  const novo = !l; l = l || { id: uid(), tipo: 'r', valor: 0, data: hoje(), cat: CATS_R[0], desc: '', forma: '' };
  const cats = t => (t === 'r' ? CATS_R : CATS_D).map(c => `<option ${c === l.cat ? 'selected' : ''}>${c}</option>`).join('');
  sheet(novo ? 'Novo lançamento' : 'Lançamento', `
    <div class="tabs" style="margin-top:10px"><button data-t="r" class="${l.tipo === 'r' ? 'on' : ''}">Receita</button><button data-t="d" class="${l.tipo === 'd' ? 'on' : ''}">Despesa</button></div>
    <label>Valor (R$)</label><input id="lv" inputmode="decimal" value="${l.valor || ''}">
    <label>Data</label><input type="date" id="ld" value="${l.data}">
    <label>Categoria</label><select id="lc">${cats(l.tipo)}</select>
    <label>Forma de pagamento</label><select id="lfo">${optsForma(l.forma, FORMAS_ALL)}</select>
    <label>Descrição</label><input id="lde" value="${esc(l.desc)}">
    <button class="btn full" id="lsave">Salvar</button>${novo ? '' : '<button class="btn del full" id="ldel">Excluir</button>'}`, b => {
    b.querySelectorAll('[data-t]').forEach(t => t.onclick = () => { l.tipo = t.dataset.t; b.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === t)); l.cat = (l.tipo === 'r' ? CATS_R : CATS_D)[0]; $('#lc').innerHTML = cats(l.tipo); });
    $('#lsave').onclick = () => {
      const v = num($('#lv').value); if (v <= 0) return toast('Informe o valor');
      Object.assign(l, { valor: v, data: $('#ld').value || hoje(), cat: $('#lc').value, forma: $('#lfo').value, desc: $('#lde').value.trim() });
      if (novo) db.lancamentos.push(l); save(); fechar(); render(); toast('Lançamento salvo');
    };
    if (!novo) $('#ldel').onclick = () => { if (!confirm('Excluir lançamento?')) return; db.lancamentos = db.lancamentos.filter(x => x.id !== l.id); save(); fechar(); render(); };
  });
}

/* ===== Configurações ===== */
function viewConfig() {
  app.innerHTML = `<div class="card"><h3>Empresa</h3><label>Nome da empresa</label><input id="cfn" value="${esc(db.config.nome)}">
  <label>WhatsApp da empresa (com DDD) — recebe os pedidos da loja e do cardápio</label><input id="cfw" inputmode="tel" value="${esc(db.config.whats)}">
  <h3 style="margin:18px 0 0">Pix (aparece para o cliente que escolher Pix na loja)</h3>
  <label>Tipo da chave</label><select id="cpt">${[['cel', 'Celular'], ['doc', 'CPF / CNPJ'], ['email', 'E-mail'], ['aleat', 'Chave aleatória']].map(([k, t]) => `<option value="${k}" ${(db.config.pixTipo || 'cel') === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
  <label>Chave Pix</label><input id="cpk" value="${esc(db.config.pixChave || '')}" placeholder="Deixe em branco para não mostrar Pix">
  <label>Nome do titular da conta</label><input id="cpn" value="${esc(db.config.pixNome || '')}">
  <label>Cidade do titular</label><input id="cpc" value="${esc(db.config.pixCidade || '')}" placeholder="Ex.: Itaporã">
  <button class="btn full" id="cfs">Salvar</button></div>
  <div class="card"><h3>Backup</h3><p class="s" style="color:var(--mut);margin-top:0">Os dados ficam salvos na nuvem e aparecem em qualquer aparelho onde você entrar. O backup é uma cópia extra.</p>
  <button class="btn sec full" id="bx">⬇️ Exportar backup</button><button class="btn sec full" id="bi">⬆️ Importar backup</button><input type="file" id="bf" accept="application/json" hidden></div>
  <div class="card"><h3>Conta</h3><div class="row"><span>Conectado como</span><b id="cfemail"></b></div><button class="btn sec full" id="sair">Sair desta conta</button></div>
  <div class="card"><h3>Sobre o app</h3><div class="row"><span>Versão</span><b>${VERSAO}</b></div><p class="s" style="color:var(--mut);margin:6px 0 0">Se alguma tela nova não aparecer, toque em atualizar. Seus dados não são apagados.</p><button class="btn sec full" id="atualizar">🔄 Atualizar o app</button></div>
  <div class="card"><h3>Zona de perigo</h3><p class="s" style="color:var(--mut);margin-top:0">Apaga tudo na nuvem e em todos os aparelhos.</p><button class="btn del full" id="apagar">Apagar todos os dados</button></div>`;
  sb.auth.getUser().then(({ data }) => { if ($('#cfemail')) $('#cfemail').textContent = data.user ? data.user.email : ''; });
  $('#sair').onclick = sair;
  $('#atualizar').onclick = async () => {
    toast('Atualizando...');
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch {}
    location.reload();
  };
  $('#cfs').onclick = () => { db.config.nome = $('#cfn').value.trim() || 'Marize Kids'; db.config.whats = $('#cfw').value.trim(); Object.assign(db.config, { pixTipo: $('#cpt').value, pixChave: $('#cpk').value.trim(), pixNome: $('#cpn').value.trim(), pixCidade: $('#cpc').value.trim() }); save(); toast('Salvo'); };
  $('#bx').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' })); a.download = `marizekids-backup-${hoje()}.json`; a.click(); };
  $('#bi').onclick = () => $('#bf').click();
  $('#bf').onchange = async e => {
    try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.eventos) || !j.config) throw 0; if (!confirm('Substituir todos os dados atuais pelo backup?')) return; db = Object.assign(vazio(), j); migrar(); save(); toast('Backup importado'); ir('dashboard'); } catch { toast('Arquivo inválido'); }
  };
  $('#apagar').onclick = () => {
    const r = prompt('ATENÇÃO: isto apaga TODOS os dados (estoque, compras, vendas, clientes, caixa) na nuvem e em TODOS os aparelhos.\n\nSe só quer atualizar o app, use o botão "Atualizar o app".\n\nPara apagar mesmo, digite APAGAR:');
    if (r === null) return;
    if (r.trim().toUpperCase() !== 'APAGAR') return toast('Nada foi apagado');
    db = vazio(); save(); ir('dashboard'); toast('Dados apagados');
  };
}
