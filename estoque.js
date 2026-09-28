'use strict';
/* ===== Estoque de produtos (insumos) e kits ===== */
// p.un = unidade de medida escolhida (ml, L, g, kg, un). O saldo é guardado na unidade base (ml, g, un).
const UNS = { ml: { base: 'ml', k: 1 }, L: { base: 'ml', k: 1000 }, g: { base: 'g', k: 1 }, kg: { base: 'g', k: 1000 }, cm: { base: 'cm', k: 1 }, m: { base: 'cm', k: 100 }, un: { base: 'un', k: 1 } };
const UNS_DA_BASE = { ml: ['ml', 'L'], g: ['g', 'kg'], cm: ['cm', 'm'], un: ['un'] };
const NOMES_UN = { ml: 'Mililitros (ml)', L: 'Litros (L)', g: 'Gramas (g)', kg: 'Quilos (kg)', cm: 'Centímetros (cm)', m: 'Metros (m)', un: 'Unidade (un)' };
const baseDe = u => (UNS[u] || UNS.un).base;
const optsUn = (base, sel) => UNS_DA_BASE[baseDe(base)].map(u => `<option ${u === sel ? 'selected' : ''}>${u}</option>`).join('');
const rn = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
const nStr = n => String(+n.toFixed(3));
function fmtQtd(q, un) { const u = UNS[un] || UNS.un; return rn(q / u.k) + ' ' + (UNS[un] ? un : 'un'); }
const saldoProd = p => db.movs.filter(m => m.produtoId === p.id).reduce((s, m) => s + m.qtd, 0);
function custoUn(p) { // custo por unidade base (ml, g ou un)
  const cs = db.compras.filter(c => c.produtoId === p.id), q = cs.reduce((s, c) => s + c.qtdBase, 0);
  return q ? cs.reduce((s, c) => s + c.valor, 0) / q : 0;
}
const baixo = p => p.minimo > 0 && saldoProd(p) <= p.minimo;
function avisosEstoque() {
  return db.produtos.filter(baixo).map(p => `📦 Estoque baixo: ${esc(p.nome)} (${fmtQtd(saldoProd(p), p.un)}; mínimo ${fmtQtd(p.minimo, p.un)})`);
}
function somaMeses(dataIso, n) {
  const d = new Date(dataIso + 'T12:00'), dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
}

/* ---- composição (usada por kits e por receitas de artes) ---- */
const custoComp = comp => comp.reduce((s, c) => { const p = by(db.produtos, c.produtoId); return s + (p ? custoUn(p) * c.qtd : 0); }, 0);
const txtComp = comp => comp.map(c => { const p = by(db.produtos, c.produtoId); return p ? `${fmtQtd(c.qtd, p.un)} de ${p.nome}` : '(produto excluído)'; }).join(' + ');
const faltasComp = (comp, mult) => comp.filter(c => { const p = by(db.produtos, c.produtoId); return p && saldoProd(p) < c.qtd * mult; }).map(c => { const p = by(db.produtos, c.produtoId); return `${p.nome}: precisa ${fmtQtd(c.qtd * mult, p.un)}, tem ${fmtQtd(saldoProd(p), p.un)}`; });
const quantosDa = comp => { const v = comp.filter(c => c.qtd > 0).map(c => { const p = by(db.produtos, c.produtoId); return p ? Math.floor(Math.max(0, saldoProd(p)) / c.qtd) : 0; }); return v.length ? Math.min(...v) : 0; };
function baixarComp(comp, mult, extra) { // lança as baixas de cada componente num mesmo lote
  const lote = uid();
  comp.forEach(c => { if (c.qtd > 0 && by(db.produtos, c.produtoId)) db.movs.push({ id: uid(), produtoId: c.produtoId, data: hoje(), tipo: 'baixa', qtd: -(c.qtd * mult), lote, ...extra }); });
  return lote;
}
function editorComp(host, comp) {
  const linha = (c, i) => {
    const p = by(db.produtos, c.produtoId) || db.produtos[0], base = baseDe(p.un);
    const u = c.u && UNS[c.u] && UNS[c.u].base === base ? c.u : p.un; c.u = u; c.produtoId = p.id;
    return `<div class="krow" data-i="${i}"><select data-kp>${db.produtos.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select><div class="par"><input data-kq inputmode="decimal" placeholder="Quantidade" value="${c.qtd ? nStr(c.qtd / UNS[u].k) : ''}"><select data-ku>${optsUn(base, u)}</select><button type="button" class="btn del sm" data-kx>✕</button></div></div>`;
  };
  const desenha = () => { host.innerHTML = comp.map(linha).join('') || '<div class="s" style="color:var(--mut)">Nenhum produto adicionado</div>'; };
  const le = () => host.querySelectorAll('.krow').forEach(r => { const c = comp[+r.dataset.i]; c.produtoId = r.querySelector('[data-kp]').value; c.u = r.querySelector('[data-ku]').value; c.qtd = num(r.querySelector('[data-kq]').value) * UNS[c.u].k; });
  host.onchange = e => { le(); if (e.target.matches('[data-kp]')) { comp[+e.target.closest('.krow').dataset.i].u = null; desenha(); } };
  host.oninput = le;
  host.onclick = e => { const x = e.target.closest('[data-kx]'); if (x) { le(); comp.splice(+x.closest('.krow').dataset.i, 1); desenha(); } };
  desenha();
  return {
    adicionar(produtoId) { le(); if (!db.produtos.length) return; comp.push({ produtoId: produtoId || db.produtos[0].id, qtd: 0, u: null }); desenha(); },
    refresh() { desenha(); },
    le
  };
}
// Chute de unidade a partir do nome, pra agilizar o cadastro rápido de um produto novo
function chuteUnidade(nome) {
  const n = nome.toLowerCase();
  if (/tinta|cola|verniz|esmalte|l[íi]quid|água|agua|xarope|óleo|oleo/.test(n)) return 'ml';
  if (/purpurina|gesso|p[óo] |farinha|areia|pigment|glitter/.test(n)) return 'g';
  if (/fita|cord[ãa]o|barbante|el[áa]stico|tecido|renda|vi[ée]s/.test(n)) return 'm';
  return 'un';
}
// Tenta achar "250 ml", "5 kg" etc. no nome do produto, pra pré-preencher o conteúdo da embalagem na importação
function chuteConteudo(nome, un) {
  const b = baseDe(un); if (b === 'un') return 0;
  const re = { ml: /(\d+[.,]?\d*)\s*(ml|l)\b/i, g: /(\d+[.,]?\d*)\s*(g|kg)\b/i, cm: /(\d+[.,]?\d*)\s*(cm|m)\b/i }[b];
  const m = nome.match(re); if (!m) return 0;
  let v = parseFloat(m[1].replace(',', '.')); if (/^(l|kg)$/i.test(m[2])) v *= 1000; if (/^m$/i.test(m[2])) v *= 100;
  return v;
}
// Painel embutido para cadastrar um produto do estoque sem sair do formulário atual (kit, receita de arte...)
function painelNovoProdutoHTML() {
  return `<div id="qpBox" hidden class="qpbox">
    <label style="margin-top:0">Nome do novo produto</label><input id="qpNome" placeholder="Ex.: Pincel, Saco plástico 15x25, Tinta verde">
    <label>Medido em</label><select id="qpUn">${Object.entries(NOMES_UN).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <button class="btn sm full" id="qpSave" type="button" style="margin-top:8px">Adicionar ao estoque</button>
  </div>`;
}
function ligaPainelNovoProduto(box, onCriado) {
  const nomeEl = box.querySelector('#qpNome'), unEl = box.querySelector('#qpUn');
  let unTocado = false;
  unEl.onchange = () => unTocado = true;
  nomeEl.oninput = () => { if (!unTocado) unEl.value = chuteUnidade(nomeEl.value); };
  box.querySelector('#qpSave').onclick = () => {
    const nome = nomeEl.value.trim(); if (!nome) return toast('Informe o nome do produto');
    const p = { id: uid(), nome, cat: '', un: unEl.value, emb: '', conteudo: 0, minimo: 0 };
    db.produtos.push(p); save();
    nomeEl.value = ''; unTocado = false; box.hidden = true;
    toast('Produto adicionado ao estoque'); onCriado(p);
  };
}

/* ---- tela ---- */
function viewEstoque() {
  const abas = [['produtos', '📦 Produtos'], ['kits', '🧰 Kits'], ['compras', '🛒 Compras'], ['hist', '📋 Histórico']];
  let corpo = '';
  if (st.et === 'produtos') {
    if (st.pcat && !by(db.pcats, st.pcat)) st.pcat = '';
    const lista = db.produtos.filter(p => !st.pcat || p.cat === st.pcat).sort((a, b) => a.nome.localeCompare(b.nome));
    corpo = `<div class="chips"><button data-pc="" class="${st.pcat ? '' : 'on'}">Todas</button>${db.pcats.map(c => `<button data-pc="${c.id}" class="${st.pcat === c.id ? 'on' : ''}">${esc(c.nome)}</button>`).join('')}<button id="novaPcat" class="add">＋ Categoria</button></div>
    ${st.pcat ? '<button class="btn sec sm" id="edPcat" style="margin-bottom:10px">✎ Editar categoria</button>' : ''}
    <div class="card">${lista.map(p => {
      const s = saldoProd(p), cu = custoUn(p), pc = by(db.pcats, p.cat);
      return `<div class="row" data-p="${p.id}"><div><div class="t">${esc(p.nome)} ${baixo(p) ? '<span class="badge bad">baixo</span>' : ''}</div><div class="s">${pc ? esc(pc.nome) + ' · ' : ''}${p.conteudo ? '≈ ' + rn(s / p.conteudo) + ' ' + esc(p.emb || 'emb.') : ''}${cu ? ' · ' + brl(cu * UNS[p.un].k) + '/' + p.un : ''}</div></div><b class="${s < 0 ? 'neg' : ''}">${fmtQtd(s, p.un)}</b></div>`;
    }).join('') || '<div class="vazio">Nenhum produto cadastrado</div>'}</div>
    <div style="display:flex;gap:8px"><button class="btn full" id="bcompra">🛒 Lançar compra</button><button class="btn sec full" id="bbaixa">➖ Dar baixa</button></div>`;
  } else if (st.et === 'kits') {
    corpo = `<div class="card">${db.kits.map(k => `<div class="row" data-k="${k.id}"><div style="flex:1"><div class="t">${esc(k.nome)}</div><div class="s">${esc(txtComp(k.itens)) || 'sem produtos'}</div><div class="s">Custo ≈ ${brl(custoComp(k.itens))} · dá para ${quantosDa(k.itens)} kit(s) com o estoque atual${k.vinculo ? ' · ligado ao catálogo' : ''}</div></div>›</div>`).join('') || '<div class="vazio">Nenhum kit. Um kit é uma lista de produtos que você usa junto (ex.: kit oficina de slime).</div>'}</div>
    <button class="btn full" id="bkit">＋ Novo kit</button>${db.kits.length ? '<button class="btn sec full" id="bbkit">➖ Dar baixa de um kit</button>' : ''}`;
  } else if (st.et === 'compras') {
    const lista = [...db.compras].sort((a, b) => b.data.localeCompare(a.data));
    corpo = `<div class="card">${lista.map(c => { const p = by(db.produtos, c.produtoId); return `<div class="row" data-c="${c.id}"><div><div class="t">${esc(p ? p.nome : '(produto excluído)')}</div><div class="s">${fdata(c.data)} · ${rn(c.nEmb)} emb. · ${esc(FORMAS_ALL[c.forma] || 'pagamento n/i')}${c.parcelas > 1 ? ' · ' + c.parcelas + 'x' : ''}${c.fornecedor ? ' · ' + esc(c.fornecedor) : ''}</div></div><b>${brl(c.valor)}</b></div>`; }).join('') || '<div class="vazio">Nenhuma compra lançada</div>'}</div>
    <button class="btn full" id="bcompra">🛒 Lançar compra</button>
    <button class="btn sec full" id="bimport">📥 Importar compras (colar de planilha)</button>`;
  } else {
    const lista = [...db.movs].sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id)).slice(0, 100);
    corpo = `<div class="card">${lista.map(m => {
      const p = by(db.produtos, m.produtoId), ev = m.eventoId && by(db.eventos, m.eventoId), cli = ev && by(db.clientes, ev.clienteId);
      const cu = p && m.qtd < 0 ? custoUn(p) * -m.qtd : 0;
      return `<div class="row" data-m="${m.id}"><div><div class="t">${esc(p ? p.nome : '(excluído)')}</div><div class="s">${fdata(m.data)} · ${esc(m.motivo || '')}${ev ? ' · festa ' + esc(cli ? cli.nome : '') + ' ' + fdata(ev.data) : ''}${cu ? ' · custo ≈ ' + brl(cu) : ''}</div></div><b class="${m.qtd < 0 ? 'neg' : 'pos'}">${m.qtd < 0 ? '−' : '+'}${fmtQtd(Math.abs(m.qtd), p ? p.un : 'un')}</b></div>`;
    }).join('') || '<div class="vazio">Sem movimentações</div>'}</div>`;
  }
  app.innerHTML = `<div class="tabs">${abas.map(([k, t]) => `<button data-et="${k}" class="${st.et === k ? 'on' : ''}">${t}</button>`).join('')}</div>${corpo}`;
  app.querySelectorAll('[data-et]').forEach(b => b.onclick = () => { st.et = b.dataset.et; viewEstoque(); });
  app.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { st.pcat = b.dataset.pc; viewEstoque(); });
  app.querySelectorAll('[data-p]').forEach(r => r.onclick = () => formProduto(by(db.produtos, r.dataset.p)));
  app.querySelectorAll('[data-k]').forEach(r => r.onclick = () => formKit(by(db.kits, r.dataset.k)));
  app.querySelectorAll('[data-c]').forEach(r => r.onclick = () => detalheCompra(by(db.compras, r.dataset.c)));
  app.querySelectorAll('[data-m]').forEach(r => r.onclick = () => detalheMov(by(db.movs, r.dataset.m)));
  const nc = $('#novaPcat'); if (nc) nc.onclick = () => formPcat();
  const ec = $('#edPcat'); if (ec) ec.onclick = () => formPcat(by(db.pcats, st.pcat));
  const bc = $('#bcompra'); if (bc) bc.onclick = () => formCompra();
  const bb = $('#bbaixa'); if (bb) bb.onclick = () => formBaixa();
  const bk = $('#bkit'); if (bk) bk.onclick = () => formKit();
  const bbk = $('#bbkit'); if (bbk) bbk.onclick = () => formBaixaKit();
  const bi = $('#bimport'); if (bi) bi.onclick = () => formImportarCompras();
}

/* ---- importar compras coladas de uma planilha (Google Sheets/Excel) ---- */
const CAMPOS_IMPORT = [
  ['data', ['data da compra', 'data compra', 'data']], ['fornecedor', ['fornecedor']],
  ['produto', ['produto/material', 'produto / material', 'produto', 'material']], ['categoria', ['categoria']],
  ['qtd', ['qtd', 'quantidade']], ['vunit', ['valor unitario', 'valor unit', 'vlr unitario']],
  ['vtotal', ['valor total', 'vlr total', 'total']], ['forma', ['forma de pagamento', 'forma pagamento', 'pagamento']],
  ['venc', ['data de vencimento', 'vencimento']],
];
const FORMA_ALIAS = [[/pix/i, 'pix'], [/dinheiro|esp[ée]cie/i, 'dinheiro'], [/d[ée]bito/i, 'debito'], [/cr[ée]dito/i, 'credito'], [/boleto/i, 'boleto']];
const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const parseNumBR = s => { if (s == null) return 0; s = String(s).replace(/[R$\s]/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
function parseDataBR(s) {
  s = String(s || '').trim(); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${pad(+mo)}-${pad(+d)}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? s.slice(0, 10) : '';
}
const mapForma = s => { s = String(s || ''); for (const [re, k] of FORMA_ALIAS) if (re.test(s)) return k; return 'outro'; };
function splitLinha(l) { return l.includes('\t') ? l.split('\t') : l.split(';').length > 1 ? l.split(';') : l.split(','); }
function parseImportacao(texto) {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return [];
  let cel0 = splitLinha(linhas[0]).map(normTxt), idx = {}, comCabecalho = false;
  CAMPOS_IMPORT.forEach(([campo, alvos]) => { const i = cel0.findIndex(h => alvos.some(a => h.includes(a))); if (i >= 0) { idx[campo] = i; comCabecalho = true; } });
  const corpo = comCabecalho ? linhas.slice(1) : linhas;
  if (!comCabecalho) idx = { data: 0, fornecedor: 1, produto: 2, categoria: 3, qtd: 4, vunit: 5, vtotal: 6, forma: 7, venc: 8 };
  return corpo.map(l => {
    const c = splitLinha(l), g = campo => idx[campo] != null ? (c[idx[campo]] || '').trim() : '';
    const produto = g('produto'); if (!produto) return null;
    const qtd = Math.max(0, parseNumBR(g('qtd')) || 1);
    const vunit = parseNumBR(g('vunit')), vtotalCel = parseNumBR(g('vtotal'));
    const vtotal = vtotalCel || vunit * qtd || vunit;
    const data = parseDataBR(g('data')) || hoje();
    return { produtoNome: produto, categoriaNome: g('categoria'), qtd, vtotal, forma: mapForma(g('forma')), data, venc: parseDataBR(g('venc')) || data, fornecedor: g('fornecedor') };
  }).filter(Boolean);
}
function formImportarCompras() {
  sheet('Importar compras', `
    <p class="s" style="color:var(--mut);margin-top:0">Copie as linhas da sua planilha (incluindo o cabeçalho, se tiver) e cole aqui. Colunas reconhecidas: Data da compra, Fornecedor, Produto/Material, Categoria, Qtd, Valor unitário, Valor total, Forma de pagamento, Data de vencimento.</p>
    <textarea id="imTxt" rows="8" placeholder="Cole aqui as linhas copiadas da planilha (Google Sheets/Excel)"></textarea>
    <button class="btn full" id="imAnalisar" type="button">Analisar</button>`, () => {
    $('#imAnalisar').onclick = () => {
      const linhas = parseImportacao($('#imTxt').value);
      if (!linhas.length) return toast('Não consegui reconhecer nenhuma linha. Confira se colou as colunas certas.');
      mostraPreviaImportacao(linhas);
    };
  });
}
function mostraPreviaImportacao(linhas) {
  const total = linhas.reduce((s, l) => s + l.vtotal, 0);
  sheet('Conferir antes de importar', `
    <p class="s" style="color:var(--mut);margin-top:0">${linhas.length} linha(s) reconhecida(s), total ${brl(total)}. Produtos e categorias novos são criados automaticamente. Confira a unidade de cada produto novo antes de confirmar — dá para corrigir depois em Estoque.</p>
    <div id="imLinhas">${linhas.map((l, i) => {
      const pExiste = db.produtos.find(p => normTxt(p.nome) === normTxt(l.produtoNome));
      const un = pExiste ? pExiste.un : chuteUnidade(l.produtoNome);
      const cont = pExiste ? pExiste.conteudo : chuteConteudo(l.produtoNome, un);
      const contHTML = pExiste
        ? (pExiste.conteudo ? `<div class="s" style="color:var(--mut)">Cada unidade comprada = ${fmtQtd(pExiste.conteudo, pExiste.un)} (já cadastrado)</div>` : '')
        : (un === 'un' ? '' : `<label style="margin:6px 0 4px">Cada unidade comprada tem quanto de ${esc(l.produtoNome)}?</label><div class="par" data-contWrap><input data-cont value="${cont ? nStr(cont / UNS[un].k) : ''}" inputmode="decimal" placeholder="Ex.: 250"><select data-contu>${optsUn(un, un)}</select></div><div class="s" style="color:var(--mut)">Ex.: se comprou um pote de 250 ml, informe 250 ml aqui — não a quantidade de potes.</div>`);
      return `<div class="krow" data-i="${i}"><div class="chk" style="margin:0 0 6px"><input type="checkbox" data-inc checked><label style="margin:0;font-weight:600">${esc(l.produtoNome)}</label>${pExiste ? '' : ' <span class="badge">novo produto</span>'}</div>
      <div class="par"><input data-qtd value="${nStr(l.qtd)}" inputmode="decimal" placeholder="Qtd (embalagens/unidades compradas)"><select data-un ${pExiste ? 'disabled' : ''}>${Object.keys(UNS).map(u => `<option value="${u}" ${u === un ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      ${contHTML}
      <div class="par" style="margin-top:6px"><input data-vtotal value="${nStr(l.vtotal)}" inputmode="decimal" placeholder="Valor total"><select data-forma>${['pix', 'dinheiro', 'debito', 'credito', 'boleto', 'outro'].map(k => `<option value="${k}" ${k === l.forma ? 'selected' : ''}>${FORMAS_ALL[k]}</option>`).join('')}</select></div>
      <div class="par" style="margin-top:6px"><input type="date" data-data value="${l.data}" title="Data da compra"><input type="date" data-venc value="${l.venc}" title="Vencimento/despesa"></div>
      <div class="s" style="color:var(--mut);margin-top:4px">${esc(l.categoriaNome || 'sem categoria')}${l.fornecedor ? ' · ' + esc(l.fornecedor) : ''}</div></div>`;
    }).join('')}</div>
    <button class="btn full" id="imConfirma">Importar as marcadas</button>
    <button class="btn sec full" id="imVoltar">← Colar outra vez</button>`, b => {
    $('#imVoltar').onclick = () => formImportarCompras();
    // recalcula o campo de conteúdo se a pessoa trocar a unidade de um produto novo
    b.addEventListener('change', e => {
      if (!e.target.matches('[data-un]')) return;
      const row = e.target.closest('.krow'), wrap = row.querySelector('[data-contWrap]'); if (!wrap) return;
      const un = e.target.value; wrap.querySelector('[data-contu]').innerHTML = optsUn(un, un);
    });
    $('#imConfirma').onclick = () => {
      let n = 0, pendentes = [];
      b.querySelectorAll('.krow').forEach(row => {
        if (!row.querySelector('[data-inc]').checked) return;
        const l = linhas[+row.dataset.i], qtd = num(row.querySelector('[data-qtd]').value), vtotal = num(row.querySelector('[data-vtotal]').value);
        if (qtd <= 0 || vtotal <= 0) return;
        let p = db.produtos.find(x => normTxt(x.nome) === normTxt(l.produtoNome));
        if (!p) {
          const un = row.querySelector('[data-un]').value;
          let conteudo = 0;
          if (un !== 'un') { const cw = row.querySelector('[data-contWrap]'); conteudo = cw ? num(cw.querySelector('[data-cont]').value) * UNS[cw.querySelector('[data-contu]').value].k : 0; if (conteudo <= 0) { pendentes.push(l.produtoNome); return; } }
          let cat = l.categoriaNome ? db.pcats.find(c => normTxt(c.nome) === normTxt(l.categoriaNome)) : null;
          if (!cat && l.categoriaNome) { cat = { id: uid(), nome: l.categoriaNome.trim() }; db.pcats.push(cat); }
          p = { id: uid(), nome: l.produtoNome.trim(), cat: cat ? cat.id : '', un, emb: '', conteudo, minimo: 0 };
          db.produtos.push(p);
        }
        const data = row.querySelector('[data-data]').value || hoje(), venc = row.querySelector('[data-venc]').value || data, forma = row.querySelector('[data-forma]').value;
        const qtdBase = qtd * (p.conteudo || 1);
        const c = { id: uid(), produtoId: p.id, data, nEmb: qtd, valor: vtotal, forma, parcelas: 1, primeira: venc, fornecedor: l.fornecedor, qtdBase };
        db.compras.push(c);
        db.movs.push({ id: uid(), produtoId: p.id, data, tipo: 'entrada', qtd: qtdBase, motivo: 'Compra (importada)', compraId: c.id });
        db.lancamentos.push({ id: uid(), tipo: 'd', valor: vtotal, data: venc, cat: 'Material', desc: `Compra: ${p.nome}`, forma, compraId: c.id, origem: 'compra' });
        n++; row.querySelector('[data-inc]').checked = false; row.style.opacity = .5;
      });
      if (n) save();
      if (pendentes.length) { toast((n ? n + ' importada(s). Falta' : 'Falta') + ' informar "quanto tem cada unidade" em: ' + pendentes.join(', ')); return; }
      fechar(); st.et = 'compras'; render(); toast(`${n} compra(s) importada(s)`);
    };
  });
}

function formPcat(c) {
  const novo = !c; c = c || { id: uid(), nome: '' };
  sheet(novo ? 'Nova categoria de produtos' : 'Editar categoria', `<label>Nome</label><input id="pn" value="${esc(c.nome)}" placeholder="Ex.: Colas e tintas, Descartáveis">
    <button class="btn full" id="psave">Salvar</button>${novo ? '' : '<button class="btn del full" id="pdel">Excluir categoria</button>'}`, () => {
    $('#psave').onclick = () => { const n = $('#pn').value.trim(); if (!n) return toast('Informe o nome'); c.nome = n; if (novo) db.pcats.push(c); save(); fechar(); st.pcat = c.id; render(); };
    if (!novo) $('#pdel').onclick = () => { if (db.produtos.some(p => p.cat === c.id)) return toast('Categoria tem produtos; mova-os antes'); if (!confirm('Excluir categoria?')) return; db.pcats = db.pcats.filter(x => x.id !== c.id); st.pcat = ''; save(); fechar(); render(); };
  });
}

function formProduto(p, opts) {
  const novo = !p; p = p || { id: uid(), nome: '', cat: st.pcat || '', un: 'ml', emb: '', conteudo: 0, minimo: 0 };
  opts = opts || {};
  const opcoesUn = (novo ? Object.keys(UNS) : UNS_DA_BASE[baseDe(p.un)]).map(u => `<option value="${u}" ${u === p.un ? 'selected' : ''}>${NOMES_UN[u]}</option>`).join('');
  sheet(novo ? (opts.entao ? 'Novo produto (1/2)' : 'Novo produto') : 'Produto', `
    ${opts.entao === 'compra' ? '<div class="s" style="color:var(--mut);margin-bottom:6px">Primeiro conte o que é o produto. Na próxima tela você informa quanto pagou, a forma de pagamento e o parcelamento.</div>' : ''}
    <label>Nome</label><input id="pn" value="${esc(p.nome)}" placeholder="Ex.: Cola branca">
    <label>Categoria</label><select id="pc"><option value="">Sem categoria</option>${db.pcats.map(c => `<option value="${c.id}" ${c.id === p.cat ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
    <label>Unidade de medida</label><select id="pu">${opcoesUn}</select>
    <label>Embalagem que eu compro (nome)</label><input id="pe" value="${esc(p.emb)}" placeholder="Ex.: galão, pacote, caixa">
    <label>Quanto vem em cada embalagem</label><div class="par"><input id="pcont" inputmode="decimal"><select id="pcu"></select></div>
    <label>Avisar quando o estoque chegar em</label><div class="par"><input id="pmin" inputmode="decimal"><select id="pmu"></select></div>
    ${novo && !opts.entao ? '<label>Já tenho em estoque (saldo inicial)</label><div class="par"><input id="pini" inputmode="decimal" placeholder="0"><select id="piu"></select></div><div class="s" style="color:var(--mut)">Isso não registra quanto você pagou. Para lançar o valor, a forma de pagamento e parcelar, use "Lançar compra" depois de salvar.</div>' : ''}
    <button class="btn full" id="psave">${opts.entao === 'compra' ? 'Continuar para lançar a compra' : opts.entao === 'baixa' ? 'Continuar para dar baixa' : 'Salvar'}</button>
    ${novo ? '' : '<button class="btn sec full" id="pcompra">🛒 Lançar compra</button><button class="btn sec full" id="pbaixa">➖ Dar baixa</button><button class="btn del full" id="pdel">Excluir produto</button>'}`, () => {
    const un = () => $('#pu').value;
    const monta = () => {
      const u = un(), base = baseDe(u);
      [['#pcont', '#pcu', p.conteudo], ['#pmin', '#pmu', p.minimo]].forEach(([i, s, q]) => { $(s).innerHTML = optsUn(base, u); if (q && !$(i).value) $(i).value = nStr(q / UNS[u].k); });
      const pi = $('#piu'); if (pi) pi.innerHTML = optsUn(base, u);
    };
    monta(); $('#pu').onchange = () => { $('#pcont').value = ''; $('#pmin').value = ''; monta(); };
    const base = (i, s) => num($(i).value) * UNS[$(s).value].k;
    $('#psave').onclick = () => {
      const n = $('#pn').value.trim(); if (!n) return toast('Informe o nome');
      Object.assign(p, { nome: n, cat: $('#pc').value, un: un(), emb: $('#pe').value.trim(), conteudo: base('#pcont', '#pcu'), minimo: base('#pmin', '#pmu') });
      if (novo) { db.produtos.push(p); const ini = $('#pini') ? base('#pini', '#piu') : 0; if (ini > 0) db.movs.push({ id: uid(), produtoId: p.id, data: hoje(), tipo: 'ajuste', qtd: ini, motivo: 'Saldo inicial' }); }
      save();
      if (novo && opts.entao === 'compra') { fechar(); return formCompra(p.id); }
      if (novo && opts.entao === 'baixa') { fechar(); return formBaixa(p.id); }
      fechar(); render(); toast('Produto salvo');
    };
    if (!novo) {
      $('#pcompra').onclick = () => formCompra(p.id); $('#pbaixa').onclick = () => formBaixa(p.id);
      $('#pdel').onclick = () => { if (db.movs.some(m => m.produtoId === p.id) || db.compras.some(c => c.produtoId === p.id)) return toast('Produto tem histórico; não dá para excluir'); if (db.kits.some(k => k.itens.some(c => c.produtoId === p.id)) || db.artes.some(a => (a.receita || []).some(c => c.produtoId === p.id))) return toast('Produto está em um kit ou receita'); if (!confirm('Excluir produto?')) return; db.produtos = db.produtos.filter(x => x.id !== p.id); save(); fechar(); render(); };
    }
  });
}

function formCompra(prodId) {
  if (!db.produtos.length) { toast('Cadastre o produto primeiro'); return formProduto(null, { entao: 'compra' }); }
  const p0 = by(db.produtos, prodId) || db.produtos[0];
  sheet('Lançar compra', `
    <label>Produto</label><select id="cp">${db.produtos.map(p => `<option value="${p.id}" ${p.id === p0.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
    <label>Quantas embalagens comprei <span id="cemb"></span></label><input id="cn" inputmode="decimal" value="1">
    <label>Valor total pago (R$)</label><input id="cv" inputmode="decimal">
    <label>Data da compra</label><input type="date" id="cd" value="${hoje()}">
    <label>Fornecedor / loja (opcional)</label><input id="cf">
    <label>Forma de pagamento</label><select id="cfo">${['pix', 'dinheiro', 'debito', 'credito', 'boleto', 'outro'].map(k => `<option value="${k}">${FORMAS_ALL[k]}</option>`).join('')}</select>
    <label>Parcelas (1 = à vista)</label><input id="cpa" type="number" min="1" max="36" inputmode="numeric" value="1">
    <label>Data da 1ª parcela</label><input type="date" id="cp1" value="${hoje()}">
    <div class="s" id="cres" style="margin-top:8px;color:var(--mut)"></div>
    <button class="btn full" id="csave">Lançar compra</button>`, b => {
    let manual = false;
    const atual = () => {
      const p = by(db.produtos, $('#cp').value), n = num($('#cn').value), v = num($('#cv').value), pa = Math.max(1, parseInt($('#cpa').value) || 1);
      $('#cemb').textContent = p && p.conteudo ? `(cada uma = ${fmtQtd(p.conteudo, p.un)})` : '';
      $('#cres').textContent = (p && p.conteudo ? `Entra no estoque: ${fmtQtd(n * p.conteudo, p.un)}. ` : '') + (v ? (pa > 1 ? `${pa}x de ${brl(v / pa)}` : 'À vista: ' + brl(v)) : '');
    };
    b.addEventListener('input', e => { if (e.target.id === 'cp1') manual = true; if (!manual && e.target.id === 'cd') $('#cp1').value = $('#cd').value; atual(); });
    b.addEventListener('change', atual); atual();
    $('#csave').onclick = () => {
      const p = by(db.produtos, $('#cp').value), nEmb = num($('#cn').value), valor = num($('#cv').value), pa = Math.max(1, Math.min(36, parseInt($('#cpa').value) || 1));
      if (nEmb <= 0) return toast('Informe a quantidade'); if (valor <= 0) return toast('Informe o valor pago');
      if (!p.conteudo && p.un !== 'un') return toast('Informe no produto quanto vem em cada embalagem');
      const c = { id: uid(), produtoId: p.id, data: $('#cd').value || hoje(), nEmb, valor, forma: $('#cfo').value, parcelas: pa, primeira: $('#cp1').value || $('#cd').value || hoje(), fornecedor: $('#cf').value.trim(), qtdBase: nEmb * (p.conteudo || 1) };
      db.compras.push(c);
      db.movs.push({ id: uid(), produtoId: p.id, data: c.data, tipo: 'entrada', qtd: c.qtdBase, motivo: 'Compra', compraId: c.id });
      const cada = Math.floor(valor / pa * 100) / 100;
      for (let i = 0; i < pa; i++) db.lancamentos.push({ id: uid(), tipo: 'd', valor: i === pa - 1 ? +(valor - cada * (pa - 1)).toFixed(2) : cada, data: somaMeses(c.primeira, i), cat: 'Material', desc: `Compra: ${p.nome}${pa > 1 ? ` (${i + 1}/${pa})` : ''}`, forma: c.forma, compraId: c.id, origem: 'compra' });
      save(); fechar(); st.et = 'compras'; if (rota === 'estoque') render(); toast('Compra lançada');
    };
  });
}
function detalheCompra(c) {
  const p = by(db.produtos, c.produtoId), ls = db.lancamentos.filter(l => l.compraId === c.id).sort((a, b) => a.data.localeCompare(b.data));
  sheet('Compra', `<div class="row"><span>Produto</span><b>${esc(p ? p.nome : '')}</b></div>
    <div class="row"><span>Data</span><b>${fdata(c.data)}</b></div><div class="row"><span>Quantidade</span><b>${rn(c.nEmb)} emb. (${fmtQtd(c.qtdBase, p ? p.un : 'un')})</b></div>
    <div class="row"><span>Valor</span><b>${brl(c.valor)}</b></div><div class="row"><span>Pagamento</span><b>${esc(FORMAS_ALL[c.forma] || '')}</b></div>
    <h3 style="margin-top:12px">Parcelas</h3>${ls.map(l => `<div class="row"><span>${esc(l.desc)}</span><span>${fdata(l.data)} · <b>${brl(l.valor)}</b></span></div>`).join('')}
    <button class="btn del full" id="cdel">Excluir compra (desfaz estoque e parcelas)</button>`, () => {
    $('#cdel').onclick = () => { if (!confirm('Excluir esta compra? A entrada no estoque e as parcelas no financeiro também serão removidas.')) return; db.compras = db.compras.filter(x => x.id !== c.id); db.movs = db.movs.filter(m => m.compraId !== c.id); db.lancamentos = db.lancamentos.filter(l => l.compraId !== c.id); save(); fechar(); render(); };
  });
}

function formBaixa(prodId) {
  if (!db.produtos.length) { toast('Cadastre o produto primeiro'); return formProduto(null, { entao: 'baixa' }); }
  const p0 = by(db.produtos, prodId) || db.produtos[0];
  const evs = [...db.eventos].filter(e => e.status !== 'cancelado').sort((a, b) => b.data.localeCompare(a.data)).slice(0, 40);
  sheet('Dar baixa no estoque', `
    <label>Produto</label><select id="bp">${db.produtos.map(p => `<option value="${p.id}" ${p.id === p0.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
    <div class="s" id="bsal" style="margin-top:4px;color:var(--mut)"></div>
    <label>Quanto usei</label><div class="par"><input id="bq" inputmode="decimal" placeholder="Ex.: 500"><select id="bu"></select></div>
    <label>Data</label><input type="date" id="bd" value="${hoje()}">
    <label>Motivo</label><select id="bm"><option>Kit de festa</option><option>Uso interno</option><option>Perda / vencimento</option><option>Outro</option></select>
    <label>Festa (opcional)</label><select id="be"><option value="">Nenhuma</option>${evs.map(e => { const c = by(db.clientes, e.clienteId); return `<option value="${e.id}">${fdata(e.data)} · ${esc(c ? c.nome : '')}</option>`; }).join('')}</select>
    <div class="s" id="bres" style="margin-top:8px"></div>
    <button class="btn full" id="bsave">Dar baixa</button>`, b => {
    const prod = () => by(db.produtos, $('#bp').value);
    const un = () => { const p = prod(); $('#bu').innerHTML = optsUn(baseDe(p.un), p.un); };
    const atual = () => {
      const p = prod(), q = num($('#bq').value) * UNS[$('#bu').value].k, s = saldoProd(p), cu = custoUn(p);
      $('#bsal').textContent = 'Saldo atual: ' + fmtQtd(s, p.un);
      $('#bres').innerHTML = q > 0 ? `Ficará com <b>${fmtQtd(s - q, p.un)}</b>${cu ? ` · custo desta baixa ≈ ${brl(cu * q)}` : ''}` : '';
    };
    un(); atual();
    $('#bp').onchange = () => { un(); atual(); };
    b.addEventListener('input', atual); b.addEventListener('change', atual);
    $('#bsave').onclick = () => {
      const p = prod(), q = num($('#bq').value) * UNS[$('#bu').value].k;
      if (q <= 0) return toast('Informe a quantidade');
      if (q > saldoProd(p) && !confirm(`O saldo é ${fmtQtd(saldoProd(p), p.un)}. Dar baixa mesmo assim (ficará negativo)?`)) return;
      db.movs.push({ id: uid(), produtoId: p.id, data: $('#bd').value || hoje(), tipo: 'baixa', qtd: -q, motivo: $('#bm').value, eventoId: $('#be').value || '' });
      save(); fechar(); st.et = 'produtos'; if (rota === 'estoque') render(); toast(baixo(p) ? 'Baixa lançada · estoque baixo!' : 'Baixa lançada');
    };
  });
}
function detalheMov(m) {
  const p = by(db.produtos, m.produtoId);
  if (m.compraId) return detalheCompra(by(db.compras, m.compraId));
  const lote = m.lote ? db.movs.filter(x => x.lote === m.lote) : [m];
  sheet('Movimentação', `<div class="row"><span>Produto</span><b>${esc(p ? p.nome : '')}</b></div><div class="row"><span>Quantidade</span><b>${m.qtd < 0 ? '−' : '+'}${fmtQtd(Math.abs(m.qtd), p ? p.un : 'un')}</b></div>
    <div class="row"><span>Data</span><b>${fdata(m.data)}</b></div><div class="row"><span>Motivo</span><b>${esc(m.motivo || '')}</b></div>
    <button class="btn del full" id="mdel">${lote.length > 1 ? `Desfazer o lote inteiro (${lote.length} produtos)` : 'Desfazer esta movimentação'}</button>`, () => {
    $('#mdel').onclick = () => {
      if (!confirm(lote.length > 1 ? 'Desfazer este lote? O estoque de todos os produtos do lote volta ao que era (a produção/venda ligada também é revertida).' : 'Desfazer? O saldo do produto volta ao que era.')) return;
      const ids = new Set(lote.map(x => x.id)); db.movs = db.movs.filter(x => !ids.has(x.id));
      if (m.lote) { db.pmovs = db.pmovs.filter(x => x.lote !== m.lote); const ev = m.eventoId && by(db.eventos, m.eventoId); if (ev && ev.kitsLote === m.lote) delete ev.kitsLote; }
      save(); fechar(); render();
    };
  });
}

/* ---- kits ---- */
function formKit(k) {
  const novo = !k; k = k || { id: uid(), nome: '', itens: [], vinculo: null };
  const comp = k.itens.map(c => ({ ...c }));
  const opcVinc = db.catalogo.flatMap(it => mod(it) === 'f' ? FAIXAS.map(f => [`${it.id}|${f}`, `${it.nome} · até ${f} crianças`]) : [[`${it.id}|`, it.nome]]);
  const vv = k.vinculo ? `${k.vinculo.itemId}|${k.vinculo.fx || ''}` : '';
  sheet(novo ? 'Novo kit' : 'Kit', `
    <label>Nome do kit</label><input id="kn" value="${esc(k.nome)}" placeholder="Ex.: Kit oficina slime - 10 crianças">
    <label>O que vai no kit</label><div id="kcomp"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sec sm" id="kadd" type="button">＋ Adicionar produto</button><button class="btn sec sm" id="knovoprod" type="button">＋ Novo produto no estoque</button></div>
    ${painelNovoProdutoHTML()}
    <div class="s" id="kcusto" style="margin-top:10px;color:var(--mut)"></div>
    <label>Ligar a um item do catálogo (opcional)</label><select id="kv"><option value="">Não ligar</option>${opcVinc.map(([v, t]) => `<option value="${v}" ${v === vv ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <div class="s" style="color:var(--mut)">Ligado, o kit aparece na festa que tiver esse item e você dá baixa do estoque com um toque.</div>
    <button class="btn full" id="ksave">Salvar kit</button>
    ${novo ? '' : '<button class="btn sec full" id="kbaixa">➖ Dar baixa deste kit</button><button class="btn del full" id="kdel">Excluir kit</button>'}`, b => {
    const ed = editorComp($('#kcomp'), comp);
    const custo = () => { ed.le(); $('#kcusto').textContent = 'Custo estimado do kit: ' + brl(custoComp(comp)) + (quantosDa(comp) || comp.length ? ` · dá para ${quantosDa(comp)} kit(s) com o estoque atual` : ''); };
    b.addEventListener('input', custo); b.addEventListener('change', custo); b.addEventListener('click', () => setTimeout(custo)); custo();
    const qpBox = $('#qpBox');
    ligaPainelNovoProduto(qpBox, novo => { ed.adicionar(novo.id); custo(); });
    $('#knovoprod').onclick = () => { qpBox.hidden = !qpBox.hidden; if (!qpBox.hidden) $('#qpNome').focus(); };
    $('#kadd').onclick = () => { if (!db.produtos.length) { qpBox.hidden = false; $('#qpNome').focus(); return toast('Cadastre um produto primeiro'); } ed.adicionar(); custo(); };
    $('#ksave').onclick = () => {
      ed.le(); const n = $('#kn').value.trim(); if (!n) return toast('Informe o nome do kit');
      const itens = comp.filter(c => c.qtd > 0).map(c => ({ produtoId: c.produtoId, qtd: c.qtd })); if (!itens.length) return toast('Adicione ao menos um produto com quantidade');
      const [iid, fx] = $('#kv').value ? $('#kv').value.split('|') : [null, ''];
      Object.assign(k, { nome: n, itens, vinculo: iid ? { itemId: iid, fx } : null });
      if (novo) db.kits.push(k); save(); fechar(); st.et = 'kits'; render(); toast('Kit salvo');
    };
    if (!novo) { $('#kbaixa').onclick = () => formBaixaKit(k.id); $('#kdel').onclick = () => { if (!confirm('Excluir o kit? (baixas já feitas continuam no histórico)')) return; db.kits = db.kits.filter(x => x.id !== k.id); save(); fechar(); render(); }; }
  });
}
function formBaixaKit(kitId) {
  if (!db.kits.length) { toast('Crie um kit primeiro'); return formKit(); }
  const k0 = by(db.kits, kitId) || db.kits[0];
  const evs = [...db.eventos].filter(e => e.status !== 'cancelado').sort((a, b) => b.data.localeCompare(a.data)).slice(0, 40);
  sheet('Dar baixa de kit', `
    <label>Kit</label><select id="xk">${db.kits.map(k => `<option value="${k.id}" ${k.id === k0.id ? 'selected' : ''}>${esc(k.nome)}</option>`).join('')}</select>
    <label>Quantos kits usei</label><input id="xq" type="number" min="1" inputmode="numeric" value="1">
    <label>Festa (opcional)</label><select id="xe"><option value="">Nenhuma</option>${evs.map(e => { const c = by(db.clientes, e.clienteId); return `<option value="${e.id}">${fdata(e.data)} · ${esc(c ? c.nome : '')}</option>`; }).join('')}</select>
    <div id="xres" style="margin-top:10px"></div>
    <button class="btn full" id="xsave">Dar baixa do kit</button>`, b => {
    const kit = () => by(db.kits, $('#xk').value), mult = () => Math.max(1, parseInt($('#xq').value) || 1);
    const atual = () => { const k = kit(), m = mult(); $('#xres').innerHTML = k.itens.map(c => { const p = by(db.produtos, c.produtoId); return p ? `<div class="row"><span>${esc(p.nome)}</span><span>−${fmtQtd(c.qtd * m, p.un)} <small style="color:var(--mut)">(tem ${fmtQtd(saldoProd(p), p.un)})</small></span></div>` : ''; }).join('') + `<div class="s" style="margin-top:6px">Custo dos produtos: <b>${brl(custoComp(k.itens) * m)}</b></div>`; };
    b.addEventListener('input', atual); b.addEventListener('change', atual); atual();
    $('#xsave').onclick = () => {
      const k = kit(), m = mult(), f = faltasComp(k.itens, m);
      if (f.length && !confirm('Estoque insuficiente:\n\n' + f.join('\n') + '\n\nDar baixa mesmo assim (ficará negativo)?')) return;
      baixarComp(k.itens, m, { motivo: 'Kit: ' + k.nome, kitId: k.id, eventoId: $('#xe').value || '' });
      save(); fechar(); st.et = 'kits'; if (rota === 'estoque') render(); toast('Baixa do kit lançada');
    };
  });
}
// Kits ligados aos itens de uma festa
function kitsDoEvento(ev) {
  const out = [];
  db.kits.forEach(k => {
    if (!k.vinculo) return;
    (ev.itens || []).filter(i => i.id === k.vinculo.itemId && (!k.vinculo.fx || String(i.fx) === String(k.vinculo.fx))).forEach(i => { const it = cit(i.id); out.push({ kit: k, q: it && mod(it) === 'f' ? 1 : (i.q || 1) }); });
  });
  return out;
}
function desenhaKitsEvento(ev, box) {
  const ks = kitsDoEvento(ev), feito = ev.kitsLote && db.movs.some(m => m.lote === ev.kitsLote);
  if (!ks.length && !feito) { box.innerHTML = ''; return; }
  box.innerHTML = `<h3 style="margin:16px 0 4px">📦 Estoque desta festa</h3>` + (feito
    ? '<div class="s" style="color:var(--ok)">✔ Baixa dos kits já lançada no estoque.</div><button class="btn sec sm" id="kdesf" type="button" style="margin-top:6px">Desfazer baixa dos kits</button>'
    : ks.map(x => `<div class="row"><span>${esc(x.kit.nome)}${x.q > 1 ? ' × ' + x.q : ''}</span><span class="s">${brl(custoComp(x.kit.itens) * x.q)}</span></div>`).join('') + '<button class="btn sec full" id="kbx" type="button">Dar baixa dos kits no estoque</button><div class="s" style="color:var(--mut);margin-top:4px">Usa os itens já salvos neste evento.</div>');
  const bx = box.querySelector('#kbx'), bd = box.querySelector('#kdesf');
  if (bx) bx.onclick = () => {
    const comp = ks.flatMap(x => x.kit.itens.map(c => ({ ...c, qtd: c.qtd * x.q }))), f = faltasComp(comp, 1);
    if (f.length && !confirm('Estoque insuficiente:\n\n' + f.join('\n') + '\n\nDar baixa mesmo assim?')) return;
    const lote = baixarComp(comp, 1, { motivo: 'Kits da festa: ' + ks.map(x => x.kit.nome).join(', '), eventoId: ev.id, kitId: ks[0].kit.id });
    const e = by(db.eventos, ev.id); e.kitsLote = lote; ev.kitsLote = lote; save(); desenhaKitsEvento(ev, box); toast('Baixa lançada no estoque');
  };
  if (bd) bd.onclick = () => {
    if (!confirm('Desfazer a baixa dos kits desta festa? O estoque volta ao que era.')) return;
    db.movs = db.movs.filter(m => m.lote !== ev.kitsLote); const e = by(db.eventos, ev.id); delete e.kitsLote; delete ev.kitsLote; save(); desenhaKitsEvento(ev, box); toast('Baixa desfeita');
  };
}
