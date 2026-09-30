'use strict';
/* ===== Relatórios: filtros, gráficos e exportação (Excel .xlsx e PDF) ===== */
const RF = { p: '6m', de: '', ate: '', tipo: '', cat: '', forma: '' };
const PERIODOS = [['mes', 'Este mês'], ['3m', '3 meses'], ['6m', '6 meses'], ['12m', '12 meses'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['custom', 'Personalizado']];

function periodoRel() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth(), fim = iso(new Date(y, m + 1, 0));
  const ini = k => iso(new Date(y, m - k, 1));
  if (RF.p === 'mes') return [ini(0), fim];
  if (RF.p === '3m') return [ini(2), fim];
  if (RF.p === '6m') return [ini(5), fim];
  if (RF.p === '12m') return [ini(11), fim];
  if (RF.p === 'ano') return [`${y}-01-01`, `${y}-12-31`];
  const ds = [...db.lancamentos.map(l => l.data), ...db.eventos.map(e => e.data), ...db.movs.map(x => x.data)].filter(Boolean).sort();
  const de = RF.p === 'custom' && RF.de ? RF.de : (ds[0] || ini(0)), ate = RF.p === 'custom' && RF.ate ? RF.ate : (ds[ds.length - 1] || fim);
  return [de, ate];
}
function agrupa(arr, chave, val) {
  const m = new Map();
  arr.forEach(x => { const k = chave(x); const o = m.get(k) || { k, v: 0, n: 0 }; o.v += val(x); o.n++; m.set(k, o); });
  return [...m.values()].sort((a, b) => b.v - a.v);
}
const nomeForma = f => f ? (FORMAS_ALL[f] || f) : 'Não informada';

function relDados() {
  const [de, ate] = periodoRel(), noP = d => d >= de && d <= ate;
  const ls = db.lancamentos.filter(l => noP(l.data) && (!RF.tipo || l.tipo === RF.tipo) && (!RF.cat || l.cat === RF.cat) && (!RF.forma || (RF.forma === '_ni' ? !l.forma : l.forma === RF.forma))).sort((a, b) => a.data.localeCompare(b.data));
  const rec = ls.filter(l => l.tipo === 'r'), desp = ls.filter(l => l.tipo === 'd');
  const R = { de, ate, ls, rec, desp };
  R.receita = rec.reduce((s, l) => s + l.valor, 0); R.despesa = desp.reduce((s, l) => s + l.valor, 0); R.saldo = R.receita - R.despesa;
  // por mês
  const [y0, m0] = de.split('-').map(Number), [y1, m1] = ate.split('-').map(Number);
  R.meses = [];
  for (let y = y0, m = m0; (y < y1 || (y === y1 && m <= m1)) && R.meses.length < 36; m === 12 ? (y++, m = 1) : m++) {
    const k = `${y}-${pad(m)}`, dm = ls.filter(l => l.data.startsWith(k));
    R.meses.push({ k, l: MESES[m - 1].slice(0, 3) + '/' + String(y).slice(2), r: dm.filter(l => l.tipo === 'r').reduce((s, l) => s + l.valor, 0), d: dm.filter(l => l.tipo === 'd').reduce((s, l) => s + l.valor, 0) });
  }
  R.despCat = agrupa(desp, l => l.cat, l => l.valor); R.recCat = agrupa(rec, l => l.cat, l => l.valor);
  R.recForma = agrupa(rec, l => nomeForma(l.forma), l => l.valor); R.despForma = agrupa(desp, l => nomeForma(l.forma), l => l.valor);
  // faturamento dos eventos (por categoria do catálogo, itens e clientes)
  R.evs = db.eventos.filter(e => noP(e.data) && (e.status === 'confirmado' || e.status === 'realizado')).sort((a, b) => a.data.localeCompare(b.data));
  const linhas = [];
  R.evs.forEach(e => (e.itens || []).forEach(i => { const it = cit(i.id); if (it) { const c = by(db.categorias, it.cat); linhas.push({ cat: c ? c.nome : '-', item: it.nome, q: mod(it) === 'f' ? 1 : i.q, v: valorItem(i), c: custoItem(i) }); } }));
  R.fatCat = agrupa(linhas, x => x.cat, x => x.v); R.fatItem = agrupa(linhas, x => x.item, x => x.v);
  R.fatCat.forEach(g => { g.c = linhas.filter(x => x.cat === g.k).reduce((s, x) => s + x.c, 0); });
  R.fatCli = agrupa(R.evs, e => { const c = by(db.clientes, e.clienteId); return c ? c.nome : 'Sem cliente'; }, e => totalEvento(e));
  R.fatTotal = R.evs.reduce((s, e) => s + totalEvento(e), 0); R.fatCusto = R.evs.reduce((s, e) => s + custoEvento(e), 0);
  // estoque
  R.prods = db.produtos.map(p => { const s = saldoProd(p), cu = custoUn(p), pc = by(db.pcats, p.cat); return { p, cat: pc ? pc.nome : '', s, cu, valor: Math.max(0, s) * cu, baixo: baixo(p) }; });
  R.valorEstoque = R.prods.reduce((s, x) => s + x.valor, 0);
  R.movs = db.movs.filter(m => noP(m.data)).sort((a, b) => a.data.localeCompare(b.data));
  R.compras = db.compras.filter(c => noP(c.data)).sort((a, b) => a.data.localeCompare(b.data));
  R.vendas = db.vendas.filter(v => noP(v.data)).sort((a, b) => a.data.localeCompare(b.data));
  R.vendaTotal = R.vendas.reduce((s, v) => s + totalVenda(v), 0); R.vendaCusto = R.vendas.reduce((s, v) => s + custoVenda(v), 0);
  R.vendaArte = agrupa(R.vendas.flatMap(v => v.itens.map(i => ({ n: nomeItemVenda(i), v: i.preco * i.q }))), x => x.n, x => x.v);
  R.artes = db.artes.map(a => { const s = saldoArte(a), c = custoArte(a); return { a, s, c, valor: Math.max(0, s) * c }; });
  return R;
}

/* ---------- Tela ---------- */
const barras = (lista, cor, tot, max = 8) => {
  if (!lista.length) return '<div class="vazio">Sem dados no período</div>';
  const top = lista.slice(0, max), resto = lista.slice(max).reduce((s, x) => s + x.v, 0), mx = Math.max(1, top[0].v);
  const rows = resto > 0 ? [...top, { k: 'Outros', v: resto }] : top;
  return rows.map(x => `<div class="hb"><div class="hl"><span>${esc(x.k)}</span><b>${brl(x.v)} <small>${tot ? Math.round(x.v / tot * 100) : 0}%</small></b></div><div class="ht"><i style="width:${Math.max(2, x.v / mx * 100)}%;background:${cor}"></i></div></div>`).join('');
};
function viewRelatorios() {
  const R = relDados();
  const cats = [...new Set(db.lancamentos.map(l => l.cat))].sort();
  const mx = Math.max(1, ...R.meses.flatMap(m => [m.r, m.d]));
  const semDados = !R.ls.length && !R.evs.length;
  app.innerHTML = `<button class="btn sec sm" id="rvolta" style="margin-bottom:10px">← Caixa</button>
  <div class="card"><h3>Filtros</h3>
    <div class="chips">${PERIODOS.map(([k, t]) => `<button data-rp="${k}" class="${RF.p === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${RF.p === 'custom' ? `<div class="par"><input type="date" id="rde" value="${R.de}"><input type="date" id="rate" value="${R.ate}"></div>` : `<div class="s" style="color:var(--mut)">${fdata(R.de)} a ${fdata(R.ate)}</div>`}
    <div class="par" style="margin-top:8px"><select id="rtipo"><option value="">Receitas e despesas</option><option value="r" ${RF.tipo === 'r' ? 'selected' : ''}>Só receitas</option><option value="d" ${RF.tipo === 'd' ? 'selected' : ''}>Só despesas</option></select>
    <select id="rcat" style="width:100%"><option value="">Todas as categorias</option>${cats.map(c => `<option ${c === RF.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <select id="rforma" style="margin-top:8px"><option value="">Todas as formas de pagamento</option>${Object.entries(FORMAS_ALL).map(([k, t]) => `<option value="${k}" ${RF.forma === k ? 'selected' : ''}>${t}</option>`).join('')}<option value="_ni" ${RF.forma === '_ni' ? 'selected' : ''}>Não informada</option></select>
    <div class="s" style="color:var(--mut);margin-top:6px">Tipo, categoria e forma filtram os lançamentos. O período vale para tudo. Inclui parcelas futuras que caem no período.</div></div>
  <div class="grid3" style="margin-bottom:12px"><div class="kpi"><small>Entrou</small><b class="pos">${brl(R.receita)}</b></div><div class="kpi"><small>Saiu</small><b class="neg">${brl(R.despesa)}</b></div><div class="kpi"><small>Saldo</small><b class="${R.saldo >= 0 ? 'pos' : 'neg'}">${brl(R.saldo)}</b></div></div>
  <div class="card"><h3>Entradas × saídas por mês</h3>${R.meses.length && (R.receita || R.despesa) ? `<div class="chart" style="height:150px">${R.meses.map(m => `<div class="c" title="${m.l}: entrou ${brl(m.r)}, saiu ${brl(m.d)}"><div class="b"><i style="height:${m.r / mx * 100}%;background:var(--ok)"></i><i style="height:${m.d / mx * 100}%;background:var(--bad)"></i></div>${m.l}</div>`).join('')}</div><div style="font-size:.7rem;color:var(--mut);margin-top:6px">🟩 entrou &nbsp; 🟥 saiu</div>
    <div style="overflow-x:auto;margin-top:8px"><table class="tb"><tr><th>Mês</th><th>Entrou</th><th>Saiu</th><th>Saldo</th></tr>${R.meses.map(m => `<tr><td>${m.l}</td><td>${brl(m.r)}</td><td>${brl(m.d)}</td><td class="${m.r - m.d >= 0 ? 'pos' : 'neg'}">${brl(m.r - m.d)}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Sem lançamentos no período</div>'}</div>
  <div class="card"><h3>💸 Para onde o dinheiro sai</h3>${barras(R.despCat, 'var(--bad)', R.despesa)}</div>
  <div class="card"><h3>💰 De onde o dinheiro entra</h3>${barras(R.recCat, 'var(--ok)', R.receita)}</div>
  <div class="card"><h3>Entradas por forma de pagamento</h3>${barras(R.recForma, 'var(--p)', R.receita)}<h3 style="margin-top:14px">Saídas por forma de pagamento</h3>${barras(R.despForma, 'var(--p2)', R.despesa)}</div>
  <div class="card"><h3>🎉 Faturamento dos eventos (${R.evs.length})</h3>
    <div class="row"><span>Faturamento</span><b>${brl(R.fatTotal)}</b></div><div class="row"><span>Custo dos itens</span><b class="neg">${brl(R.fatCusto)}</b></div><div class="row"><span><b>Lucro</b></span><b class="${R.fatTotal - R.fatCusto >= 0 ? 'pos' : 'neg'}">${brl(R.fatTotal - R.fatCusto)}</b></div>
    <h3 style="margin-top:14px">Por categoria do catálogo</h3>${barras(R.fatCat, 'var(--p)', R.fatCat.reduce((s, x) => s + x.v, 0))}
    <h3 style="margin-top:14px">Itens que mais faturam</h3>${barras(R.fatItem, 'var(--p2)', R.fatItem.reduce((s, x) => s + x.v, 0), 6)}
    <h3 style="margin-top:14px">Melhores clientes</h3>${barras(R.fatCli, 'var(--warn)', R.fatTotal, 5)}</div>
  <div class="card"><h3>🛍️ Vendas de artes (${R.vendas.length})</h3><div class="row"><span>Vendido</span><b>${brl(R.vendaTotal)}</b></div><div class="row"><span>Custo</span><b class="neg">${brl(R.vendaCusto)}</b></div><div class="row"><span><b>Lucro</b></span><b class="${R.vendaTotal - R.vendaCusto >= 0 ? 'pos' : 'neg'}">${brl(R.vendaTotal - R.vendaCusto)}</b></div>
    <h3 style="margin-top:14px">O que mais vende</h3>${barras(R.vendaArte, 'var(--p)', R.vendaTotal, 6)}
    <h3 style="margin-top:14px">Estoque de artes</h3>${R.artes.map(x => `<div class="row"><span>${esc(x.a.nome)}</span><b>${x.s} un</b></div>`).join('') || '<div class="vazio">Nenhuma arte cadastrada</div>'}</div>
  <div class="card"><h3>📦 Estoque de produtos</h3><div class="row"><span>Valor em estoque (custo médio)</span><b>${brl(R.valorEstoque)}</b></div>
    ${R.prods.map(x => `<div class="row"><div><div class="t">${esc(x.p.nome)} ${x.baixo ? '<span class="badge bad">baixo</span>' : ''}</div><div class="s">${esc(x.cat)}</div></div><b>${fmtQtd(x.s, x.p.un)}</b></div>`).join('') || '<div class="vazio">Nenhum produto</div>'}</div>
  <div class="card"><h3>Exportar${semDados ? ' <small style="color:var(--mut)">(sem dados no período)</small>' : ''}</h3><p class="s" style="color:var(--mut);margin-top:0">Exporta o período e os filtros acima: lançamentos, resumo por categoria, eventos, compras, movimentações e posição do estoque.</p>
    <button class="btn full" id="rxls">📊 Baixar Excel (.xlsx)</button><button class="btn sec full" id="rpdf">📄 Gerar PDF</button></div>`;
  $('#rvolta').onclick = () => ir('financeiro');
  app.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => { RF.p = b.dataset.rp; if (RF.p === 'custom' && !RF.de) { RF.de = R.de; RF.ate = R.ate; } viewRelatorios(); });
  const de = $('#rde'), ate = $('#rate');
  if (de) { de.onchange = () => { RF.de = de.value; viewRelatorios(); }; ate.onchange = () => { RF.ate = ate.value; viewRelatorios(); }; }
  $('#rtipo').onchange = e => { RF.tipo = e.target.value; viewRelatorios(); };
  $('#rcat').onchange = e => { RF.cat = e.target.value; viewRelatorios(); };
  $('#rforma').onchange = e => { RF.forma = e.target.value; viewRelatorios(); };
  $('#rxls').onclick = exportarExcel; $('#rpdf').onclick = exportarPdf;
}

/* ---------- Excel (.xlsx gerado no próprio aparelho) ---------- */
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(arquivos) { // arquivos: [[nome, string]] sem compressão
  const enc = new TextEncoder(), partes = [], central = []; let off = 0;
  arquivos.forEach(([nome, txt]) => {
    const n = enc.encode(nome), d = enc.encode(txt), crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    partes.push(new Uint8Array(h.buffer), n, d); central.push(new Uint8Array(c.buffer), n); off += 30 + n.length + d.length;
  });
  const tam = central.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, arquivos.length, true); e.setUint16(10, arquivos.length, true); e.setUint32(12, tam, true); e.setUint32(16, off, true);
  return new Blob([...partes, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colL = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
// célula: texto = string; número = number; dinheiro = {m: número}
function xlsx(planilhas) {
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const arq = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${planilhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets>${planilhas.map((p, i) => `<sheet name="${xe(p.nome.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${planilhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${RNS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${planilhas.length + 1}" Type="${RNS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`]
  ];
  planilhas.forEach((p, si) => {
    const rows = p.linhas.map((l, ri) => `<row r="${ri + 1}">${l.map((c, ci) => {
      const ref = colL(ci) + (ri + 1), cab = ri === (p.cab ?? 0);
      if (c === '' || c == null) return '';
      if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`;
      if (typeof c === 'object') return `<c r="${ref}" s="2"><v>${c.m}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${cab || p.negrito?.includes(ri) ? ' s="1"' : ''}><is><t xml:space="preserve">${xe(c)}</t></is></c>`;
    }).join('')}</row>`).join('');
    arq.push([`xl/worksheets/sheet${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><cols>${(p.larg || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData></worksheet>`]);
  });
  return zipStore(arq);
}
const M = n => ({ m: Math.round(n * 100) / 100 });
function planilhasRel(R) {
  const filtros = [`Período: ${fdata(R.de)} a ${fdata(R.ate)}`, RF.tipo ? 'Tipo: ' + (RF.tipo === 'r' ? 'receitas' : 'despesas') : '', RF.cat ? 'Categoria: ' + RF.cat : '', RF.forma ? 'Forma: ' + (RF.forma === '_ni' ? 'não informada' : nomeForma(RF.forma)) : ''].filter(Boolean).join(' | ');
  const nomeEv = e => { const c = by(db.clientes, e.clienteId); return c ? c.nome : ''; };
  return [
    { nome: 'Resumo', larg: [34, 18, 18, 18], negrito: [0], linhas: [
      [db.config.nome + ' - Relatório financeiro'], [filtros], [],
      ['Entrou', M(R.receita)], ['Saiu', M(R.despesa)], ['Saldo', M(R.saldo)], [],
      ['Mês', 'Entrou', 'Saiu', 'Saldo'], ...R.meses.map(m => [m.l, M(m.r), M(m.d), M(m.r - m.d)]), [],
      ['Faturamento dos eventos', M(R.fatTotal)], ['Custo dos itens', M(R.fatCusto)], ['Lucro dos eventos', M(R.fatTotal - R.fatCusto)], ['Valor em estoque (custo médio)', M(R.valorEstoque)], ['Vendas de artes', M(R.vendaTotal)], ['Lucro das vendas de artes', M(R.vendaTotal - R.vendaCusto)]], cab: 7 },
    { nome: 'Lançamentos', larg: [12, 10, 26, 44, 22, 14], linhas: [['Data', 'Tipo', 'Categoria', 'Descrição', 'Forma de pagamento', 'Valor'], ...R.ls.map(l => [fdata(l.data), l.tipo === 'r' ? 'Receita' : 'Despesa', l.cat, l.desc || '', nomeForma(l.forma), M(l.valor)])] },
    { nome: 'Por categoria', larg: [14, 30, 16, 12], linhas: [['Tipo', 'Categoria', 'Total', 'Lançamentos'], ...R.recCat.map(x => ['Receita', x.k, M(x.v), x.n]), ...R.despCat.map(x => ['Despesa', x.k, M(x.v), x.n])] },
    { nome: 'Por forma pagto', larg: [14, 24, 16, 12], linhas: [['Tipo', 'Forma', 'Total', 'Lançamentos'], ...R.recForma.map(x => ['Receita', x.k, M(x.v), x.n]), ...R.despForma.map(x => ['Despesa', x.k, M(x.v), x.n])] },
    { nome: 'Eventos', larg: [12, 26, 30, 14, 14, 14, 14, 14], linhas: [['Data', 'Cliente', 'Local', 'Status', 'Total', 'Custo', 'Lucro', 'Sinal'], ...R.evs.map(e => [fdata(e.data), nomeEv(e), e.local || '', STATUS[e.status], M(totalEvento(e)), M(custoEvento(e)), M(totalEvento(e) - custoEvento(e)), M(e.sinal || 0)])] },
    { nome: 'Faturamento catálogo', larg: [28, 16, 16, 16], linhas: [['Categoria', 'Faturamento', 'Custo', 'Lucro'], ...R.fatCat.map(x => [x.k, M(x.v), M(x.c), M(x.v - x.c)]), [], ['Item', 'Faturamento', 'Vezes'], ...R.fatItem.map(x => [x.k, M(x.v), x.n])], cab: 0, negrito: [R.fatCat.length + 2] },
    { nome: 'Vendas de artes', larg: [12, 24, 40, 14, 14, 14, 20, 12], linhas: [['Data', 'Cliente', 'Itens', 'Total', 'Custo', 'Lucro', 'Pagamento', 'Situação'], ...R.vendas.map(v => [fdata(v.data), nomeCliVenda(v), v.itens.map(i => { const a = by(db.artes, i.arteId); return i.q + 'x ' + (a ? a.nome : '?'); }).join(', '), M(totalVenda(v)), M(custoVenda(v)), M(totalVenda(v) - custoVenda(v)), nomeForma(v.forma) + (v.parcelas > 1 ? ' ' + v.parcelas + 'x' : ''), v.pago ? 'Recebido' : 'A receber'])] },
    { nome: 'Estoque de artes', larg: [30, 12, 14, 16, 18], linhas: [['Arte', 'Estoque', 'Preço', 'Custo unitário', 'Valor em estoque (custo)'], ...R.artes.map(x => [x.a.nome, x.s, M(x.a.preco || 0), M(x.c), M(x.valor)])] },
    { nome: 'Estoque atual', larg: [30, 22, 16, 16, 16, 14], linhas: [['Produto', 'Categoria', 'Saldo', 'Custo médio/un. base', 'Valor em estoque', 'Situação'], ...R.prods.map(x => [x.p.nome, x.cat, fmtQtd(x.s, x.p.un), M(x.cu), M(x.valor), x.baixo ? 'Estoque baixo' : 'OK'])] },
    { nome: 'Compras', larg: [12, 28, 12, 14, 20, 10, 24], linhas: [['Data', 'Produto', 'Embalagens', 'Valor', 'Pagamento', 'Parcelas', 'Fornecedor'], ...R.compras.map(c => { const p = by(db.produtos, c.produtoId); return [fdata(c.data), p ? p.nome : '', c.nEmb, M(c.valor), nomeForma(c.forma), c.parcelas || 1, c.fornecedor || '']; })] },
    { nome: 'Movim. estoque', larg: [12, 28, 12, 16, 24, 26], linhas: [['Data', 'Produto', 'Tipo', 'Quantidade', 'Motivo', 'Festa'], ...R.movs.map(m => { const p = by(db.produtos, m.produtoId), ev = m.eventoId && by(db.eventos, m.eventoId); return [fdata(m.data), p ? p.nome : '', m.tipo === 'baixa' ? 'Baixa' : m.tipo === 'entrada' ? 'Entrada' : 'Ajuste', (m.qtd < 0 ? '-' : '+') + fmtQtd(Math.abs(m.qtd), p ? p.un : 'un'), m.motivo || '', ev ? nomeEv(ev) + ' ' + fdata(ev.data) : '']; })] }
  ];
}
function baixarArquivo(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
function exportarExcel() {
  try { const R = relDados(); baixarArquivo(xlsx(planilhasRel(R)), `marizekids-relatorio-${R.de}-a-${R.ate}.xlsx`); toast('Excel gerado'); }
  catch (e) { toast('Não foi possível gerar o Excel'); }
}

/* ---------- PDF (usa a impressão do navegador: "Salvar como PDF") ---------- */
function exportarPdf() {
  const R = relDados(), tb = (cab, linhas) => `<table><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr>${linhas.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  const nomeEv = e => { const c = by(db.clientes, e.clienteId); return c ? c.nome : ''; };
  const bar = (lista, cor, tot) => lista.map(x => `<div class="h"><span>${esc(x.k)}</span><div class="t"><i style="width:${Math.max(2, tot ? x.v / lista[0].v * 100 : 0)}%;background:${cor}"></i></div><b>${brl(x.v)} (${tot ? Math.round(x.v / tot * 100) : 0}%)</b></div>`).join('') || '<p>Sem dados</p>';
  const mx = Math.max(1, ...R.meses.flatMap(m => [m.r, m.d]));
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(db.config.nome)}</title><style>
  @page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#222;font-size:11px}h1{margin:0;color:#7c3aed}h2{font-size:14px;border-bottom:2px solid #7c3aed;padding-bottom:3px;margin:18px 0 8px}
  .k{display:flex;gap:10px}.k div{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px;text-align:center}.k b{display:block;font-size:15px}.pos{color:#16a34a}.neg{color:#dc2626}
  table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#7c3aed;color:#fff;text-align:left;padding:4px 6px}td{padding:3px 6px;border-bottom:1px solid #e5e5e5}tr:nth-child(even) td{background:#faf8fd}
  .h{display:flex;align-items:center;gap:8px;margin:3px 0}.h span{width:32%}.h .t{flex:1;background:#eee;height:9px;border-radius:5px}.h .t i{display:block;height:9px;border-radius:5px}.h b{width:28%;text-align:right}
  .ch{display:flex;align-items:flex-end;gap:6px;height:110px;margin-top:6px}.ch .c{flex:1;text-align:center;font-size:9px;display:flex;flex-direction:column;justify-content:flex-end;height:100%}.ch .b{display:flex;align-items:flex-end;gap:2px;height:90px}.ch i{flex:1;display:block}
  tr,.h{page-break-inside:avoid}.no{color:#888;font-size:10px}
  </style></head><body>
  <h1>${esc(db.config.nome)} - Relatório financeiro</h1><div class="no">Período: ${fdata(R.de)} a ${fdata(R.ate)}${RF.tipo ? ' · ' + (RF.tipo === 'r' ? 'só receitas' : 'só despesas') : ''}${RF.cat ? ' · categoria ' + esc(RF.cat) : ''}${RF.forma ? ' · forma ' + esc(RF.forma === '_ni' ? 'não informada' : nomeForma(RF.forma)) : ''} · gerado em ${fdata(hoje())}</div>
  <h2>Resumo</h2><div class="k"><div>Entrou<b class="pos">${brl(R.receita)}</b></div><div>Saiu<b class="neg">${brl(R.despesa)}</b></div><div>Saldo<b class="${R.saldo >= 0 ? 'pos' : 'neg'}">${brl(R.saldo)}</b></div><div>Lucro dos eventos<b>${brl(R.fatTotal - R.fatCusto)}</b></div></div>
  <h2>Entradas × saídas por mês</h2><div class="ch">${R.meses.map(m => `<div class="c"><div class="b"><i style="height:${m.r / mx * 100}%;background:#16a34a"></i><i style="height:${m.d / mx * 100}%;background:#dc2626"></i></div>${m.l}</div>`).join('')}</div>
  ${tb(['Mês', 'Entrou', 'Saiu', 'Saldo'], R.meses.map(m => [m.l, brl(m.r), brl(m.d), brl(m.r - m.d)]))}
  <h2>Para onde o dinheiro sai</h2>${bar(R.despCat, '#dc2626', R.despesa)}
  <h2>De onde o dinheiro entra</h2>${bar(R.recCat, '#16a34a', R.receita)}
  <h2>Por forma de pagamento</h2><b>Entradas</b>${bar(R.recForma, '#7c3aed', R.receita)}<b>Saídas</b>${bar(R.despForma, '#ec4899', R.despesa)}
  <h2>Faturamento dos eventos</h2>${tb(['Categoria', 'Faturamento', 'Custo', 'Lucro'], R.fatCat.map(x => [x.k, brl(x.v), brl(x.c), brl(x.v - x.c)]))}
  ${tb(['Item que mais fatura', 'Faturamento', 'Vezes'], R.fatItem.slice(0, 10).map(x => [x.k, brl(x.v), x.n]))}
  ${tb(['Cliente', 'Total em eventos', 'Eventos'], R.fatCli.slice(0, 10).map(x => [x.k, brl(x.v), x.n]))}
  <h2>Eventos do período</h2>${tb(['Data', 'Cliente', 'Status', 'Total', 'Lucro'], R.evs.map(e => [fdata(e.data), nomeEv(e), STATUS[e.status], brl(totalEvento(e)), brl(totalEvento(e) - custoEvento(e))]))}
  <h2>Lançamentos</h2>${tb(['Data', 'Tipo', 'Categoria', 'Descrição', 'Forma', 'Valor'], R.ls.map(l => [fdata(l.data), l.tipo === 'r' ? 'Receita' : 'Despesa', l.cat, l.desc || '', nomeForma(l.forma), brl(l.valor)]))}
  <h2>Vendas de artes</h2>${tb(['Data', 'Cliente', 'Total', 'Lucro', 'Situação'], R.vendas.map(v => [fdata(v.data), nomeCliVenda(v), brl(totalVenda(v)), brl(totalVenda(v) - custoVenda(v)), v.pago ? 'Recebido' : 'A receber']))}
  ${tb(['Arte', 'Estoque', 'Custo unit.', 'Preço'], R.artes.map(x => [x.a.nome, x.s + ' un', brl(x.c), brl(x.a.preco || 0)]))}
  <h2>Estoque de produtos (valor ${brl(R.valorEstoque)})</h2>${tb(['Produto', 'Categoria', 'Saldo', 'Valor em estoque', 'Situação'], R.prods.map(x => [x.p.nome, x.cat, fmtQtd(x.s, x.p.un), brl(x.valor), x.baixo ? 'Estoque baixo' : 'OK']))}
  <h2>Compras de produtos</h2>${tb(['Data', 'Produto', 'Valor', 'Pagamento', 'Parcelas'], R.compras.map(c => { const p = by(db.produtos, c.produtoId); return [fdata(c.data), p ? p.nome : '', brl(c.valor), nomeForma(c.forma), c.parcelas || 1]; }))}
  <h2>Movimentações de estoque</h2>${tb(['Data', 'Produto', 'Quantidade', 'Motivo'], R.movs.map(m => { const p = by(db.produtos, m.produtoId); return [fdata(m.data), p ? p.nome : '', (m.qtd < 0 ? '-' : '+') + fmtQtd(Math.abs(m.qtd), p ? p.un : 'un'), m.motivo || '']; }))}
  <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
  if (!w) toast('Permita pop-ups para gerar o PDF');
  else toast('Na janela que abriu, escolha "Salvar como PDF"');
}
