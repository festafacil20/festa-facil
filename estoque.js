'use strict';
/* ===== Estoque de produtos (insumos) ===== */
// Cada produto é controlado numa unidade base (ml, g ou un). Compras e baixas aceitam L/kg com conversão.
const UNS = { ml: { base: 'ml', k: 1 }, L: { base: 'ml', k: 1000 }, g: { base: 'g', k: 1 }, kg: { base: 'g', k: 1000 }, un: { base: 'un', k: 1 } };
const UNS_DA_BASE = { ml: ['ml', 'L'], g: ['g', 'kg'], un: ['un'] };
const optsUn = (base, sel) => UNS_DA_BASE[base].map(u => `<option ${u === sel ? 'selected' : ''}>${u}</option>`).join('');
const rn = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
function fmtQtd(q, un) {
  if (un === 'ml') return Math.abs(q) >= 1000 ? rn(q / 1000) + ' L' : rn(q) + ' ml';
  if (un === 'g') return Math.abs(q) >= 1000 ? rn(q / 1000) + ' kg' : rn(q) + ' g';
  return rn(q) + ' un';
}
const saldoProd = p => db.movs.filter(m => m.produtoId === p.id).reduce((s, m) => s + m.qtd, 0);
function custoUn(p) {
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

function viewEstoque() {
  const abas = [['produtos', '📦 Produtos'], ['compras', '🛒 Compras'], ['hist', '📋 Histórico']];
  let corpo = '';
  if (st.et === 'produtos') {
    if (st.pcat && !by(db.pcats, st.pcat)) st.pcat = '';
    const lista = db.produtos.filter(p => !st.pcat || p.cat === st.pcat).sort((a, b) => a.nome.localeCompare(b.nome));
    corpo = `<div class="chips"><button data-pc="" class="${st.pcat ? '' : 'on'}">Todas</button>${db.pcats.map(c => `<button data-pc="${c.id}" class="${st.pcat === c.id ? 'on' : ''}">${esc(c.nome)}</button>`).join('')}<button id="novaPcat" class="add">＋ Categoria</button></div>
    ${st.pcat ? '<button class="btn sec sm" id="edPcat" style="margin-bottom:10px">✎ Editar categoria</button>' : ''}
    <div class="card">${lista.map(p => {
      const s = saldoProd(p), cu = custoUn(p), pc = by(db.pcats, p.cat);
      return `<div class="row" data-p="${p.id}"><div><div class="t">${esc(p.nome)} ${baixo(p) ? '<span class="badge bad">baixo</span>' : ''}</div><div class="s">${pc ? esc(pc.nome) + ' · ' : ''}${p.conteudo ? '≈ ' + rn(s / p.conteudo) + ' ' + esc(p.emb || 'emb.') : ''}${cu ? ' · ' + brl(cu * (p.un === 'un' ? 1 : (p.un === 'ml' || p.un === 'g' ? 1000 : 1))) + '/' + (p.un === 'ml' ? 'L' : p.un === 'g' ? 'kg' : 'un') : ''}</div></div><b class="${s < 0 ? 'neg' : ''}">${fmtQtd(s, p.un)}</b></div>`;
    }).join('') || '<div class="vazio">Nenhum produto cadastrado</div>'}</div>
    <div style="display:flex;gap:8px"><button class="btn full" id="bcompra">🛒 Lançar compra</button><button class="btn sec full" id="bbaixa">➖ Dar baixa</button></div>`;
  } else if (st.et === 'compras') {
    const lista = [...db.compras].sort((a, b) => b.data.localeCompare(a.data));
    corpo = `<div class="card">${lista.map(c => { const p = by(db.produtos, c.produtoId); return `<div class="row" data-c="${c.id}"><div><div class="t">${esc(p ? p.nome : '(produto excluído)')}</div><div class="s">${fdata(c.data)} · ${rn(c.nEmb)} emb. · ${esc(FORMAS_ALL[c.forma] || 'pagamento n/i')}${c.parcelas > 1 ? ' · ' + c.parcelas + 'x' : ''}${c.fornecedor ? ' · ' + esc(c.fornecedor) : ''}</div></div><b>${brl(c.valor)}</b></div>`; }).join('') || '<div class="vazio">Nenhuma compra lançada</div>'}</div>
    <button class="btn full" id="bcompra">🛒 Lançar compra</button>`;
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
  app.querySelectorAll('[data-c]').forEach(r => r.onclick = () => detalheCompra(by(db.compras, r.dataset.c)));
  app.querySelectorAll('[data-m]').forEach(r => r.onclick = () => detalheMov(by(db.movs, r.dataset.m)));
  const nc = $('#novaPcat'); if (nc) nc.onclick = () => formPcat();
  const ec = $('#edPcat'); if (ec) ec.onclick = () => formPcat(by(db.pcats, st.pcat));
  const bc = $('#bcompra'); if (bc) bc.onclick = () => formCompra();
  const bb = $('#bbaixa'); if (bb) bb.onclick = () => formBaixa();
}

function formPcat(c) {
  const novo = !c; c = c || { id: uid(), nome: '' };
  sheet(novo ? 'Nova categoria de produtos' : 'Editar categoria', `<label>Nome</label><input id="pn" value="${esc(c.nome)}" placeholder="Ex.: Colas e tintas, Descartáveis">
    <button class="btn full" id="psave">Salvar</button>${novo ? '' : '<button class="btn del full" id="pdel">Excluir categoria</button>'}`, () => {
    $('#psave').onclick = () => { const n = $('#pn').value.trim(); if (!n) return toast('Informe o nome'); c.nome = n; if (novo) db.pcats.push(c); save(); fechar(); st.pcat = c.id; render(); };
    if (!novo) $('#pdel').onclick = () => { if (db.produtos.some(p => p.cat === c.id)) return toast('Categoria tem produtos; mova-os antes'); if (!confirm('Excluir categoria?')) return; db.pcats = db.pcats.filter(x => x.id !== c.id); st.pcat = ''; save(); fechar(); render(); };
  });
}

function formProduto(p) {
  const novo = !p; p = p || { id: uid(), nome: '', cat: st.pcat || '', un: 'ml', emb: '', conteudo: 0, minimo: 0 };
  sheet(novo ? 'Novo produto' : 'Produto', `
    <label>Nome</label><input id="pn" value="${esc(p.nome)}" placeholder="Ex.: Cola branca">
    <label>Categoria</label><select id="pc"><option value="">Sem categoria</option>${db.pcats.map(c => `<option value="${c.id}" ${c.id === p.cat ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
    <label>Controlar o estoque em</label><select id="pu" ${novo ? '' : 'disabled'}><option value="ml" ${p.un === 'ml' ? 'selected' : ''}>Líquido (ml / litros)</option><option value="g" ${p.un === 'g' ? 'selected' : ''}>Peso (g / kg)</option><option value="un" ${p.un === 'un' ? 'selected' : ''}>Unidades</option></select>
    <label>Embalagem que eu compro (nome)</label><input id="pe" value="${esc(p.emb)}" placeholder="Ex.: galão, pacote, caixa">
    <label>Quanto vem em cada embalagem</label><div class="par"><input id="pcont" inputmode="decimal" value=""><select id="pcu"></select></div>
    <label>Avisar quando o estoque chegar em</label><div class="par"><input id="pmin" inputmode="decimal" value=""><select id="pmu"></select></div>
    ${novo ? '<label>Já tenho em estoque (saldo inicial)</label><div class="par"><input id="pini" inputmode="decimal" placeholder="0"><select id="piu"></select></div>' : ''}
    <button class="btn full" id="psave">Salvar</button>
    ${novo ? '' : '<button class="btn sec full" id="pcompra">🛒 Lançar compra</button><button class="btn sec full" id="pbaixa">➖ Dar baixa</button><button class="btn del full" id="pdel">Excluir produto</button>'}`, b => {
    const un = () => $('#pu').value;
    const mostra = (id, q) => { const u = un(); const sel = (u === 'un') ? 'un' : (q >= 1000 ? UNS_DA_BASE[u][1] : u); return { sel, val: q ? (q / UNS[sel].k) : '' }; };
    const monta = () => {
      [['#pcont', '#pcu', p.conteudo], ['#pmin', '#pmu', p.minimo]].forEach(([i, s, q]) => {
        const f = mostra(i, q); $(s).innerHTML = optsUn(un(), f.sel); if (q && !$(i).value) $(i).value = rn(f.val).replace(/\./g, '').replace(',', '.');
      });
      const pi = $('#piu'); if (pi) pi.innerHTML = optsUn(un(), un() === 'un' ? 'un' : un());
    };
    monta(); $('#pu').onchange = () => { $('#pcont').value = ''; $('#pmin').value = ''; p.conteudo = 0; p.minimo = 0; monta(); };
    const base = (i, s) => num($(i).value) * UNS[$(s).value].k;
    $('#psave').onclick = () => {
      const n = $('#pn').value.trim(); if (!n) return toast('Informe o nome');
      Object.assign(p, { nome: n, cat: $('#pc').value, emb: $('#pe').value.trim(), conteudo: base('#pcont', '#pcu'), minimo: base('#pmin', '#pmu') });
      if (novo) { p.un = un(); db.produtos.push(p); const ini = base('#pini', '#piu'); if (ini > 0) db.movs.push({ id: uid(), produtoId: p.id, data: hoje(), tipo: 'ajuste', qtd: ini, motivo: 'Saldo inicial' }); }
      save(); fechar(); render(); toast('Produto salvo');
    };
    if (!novo) {
      $('#pcompra').onclick = () => formCompra(p.id); $('#pbaixa').onclick = () => formBaixa(p.id);
      $('#pdel').onclick = () => { if (db.movs.some(m => m.produtoId === p.id) || db.compras.some(c => c.produtoId === p.id)) return toast('Produto tem histórico; não dá para excluir'); if (!confirm('Excluir produto?')) return; db.produtos = db.produtos.filter(x => x.id !== p.id); save(); fechar(); render(); };
    }
  });
}

function formCompra(prodId) {
  if (!db.produtos.length) { toast('Cadastre um produto primeiro'); return formProduto(); }
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
    <button class="btn full" id="csave">Lançar compra</button>`, () => {
    let manual = false;
    const atual = () => {
      const p = by(db.produtos, $('#cp').value), n = num($('#cn').value), v = num($('#cv').value), pa = Math.max(1, parseInt($('#cpa').value) || 1);
      $('#cemb').textContent = p && p.conteudo ? `(cada uma = ${fmtQtd(p.conteudo, p.un)})` : '';
      $('#cres').textContent = (p && p.conteudo ? `Entra no estoque: ${fmtQtd(n * p.conteudo, p.un)}. ` : '') + (v ? (pa > 1 ? `${pa}x de ${brl(v / pa)}` : 'À vista: ' + brl(v)) : '');
    };
    $('#sheetBody').addEventListener('input', e => { if (e.target.id === 'cp1') manual = true; if (!manual && (e.target.id === 'cd')) $('#cp1').value = $('#cd').value; atual(); });
    $('#sheetBody').addEventListener('change', atual); atual();
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
  if (!db.produtos.length) { toast('Cadastre um produto primeiro'); return formProduto(); }
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
    <button class="btn full" id="bsave">Dar baixa</button>`, () => {
    const prod = () => by(db.produtos, $('#bp').value);
    const un = () => { const p = prod(); $('#bu').innerHTML = optsUn(p.un, p.un); };
    const atual = () => {
      const p = prod(), q = num($('#bq').value) * UNS[$('#bu').value].k, s = saldoProd(p), cu = custoUn(p);
      $('#bsal').textContent = 'Saldo atual: ' + fmtQtd(s, p.un);
      $('#bres').innerHTML = q > 0 ? `Ficará com <b>${fmtQtd(s - q, p.un)}</b>${cu ? ` · custo desta baixa ≈ ${brl(cu * q)}` : ''}` : '';
    };
    un(); atual();
    $('#bp').onchange = () => { un(); atual(); };
    $('#sheetBody').addEventListener('input', atual); $('#sheetBody').addEventListener('change', atual);
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
  sheet('Movimentação', `<div class="row"><span>Produto</span><b>${esc(p ? p.nome : '')}</b></div><div class="row"><span>Quantidade</span><b>${m.qtd < 0 ? '−' : '+'}${fmtQtd(Math.abs(m.qtd), p ? p.un : 'un')}</b></div>
    <div class="row"><span>Data</span><b>${fdata(m.data)}</b></div><div class="row"><span>Motivo</span><b>${esc(m.motivo || '')}</b></div>
    <button class="btn del full" id="mdel">Desfazer esta movimentação</button>`, () => {
    $('#mdel').onclick = () => { if (!confirm('Desfazer? O saldo do produto volta ao que era.')) return; db.movs = db.movs.filter(x => x.id !== m.id); save(); fechar(); render(); };
  });
}
