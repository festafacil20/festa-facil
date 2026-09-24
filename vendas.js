'use strict';
/* ===== Vendas de produtos próprios (ex.: artes em gesso) ===== */
// Estoque das artes = soma de db.pmovs (produção +, venda −, ajuste ±). Insumos usados na produção saem de db.movs.
const saldoArte = a => db.pmovs.filter(m => m.arteId === a.id).reduce((s, m) => s + m.qtd, 0);
const custoArte = a => custoComp(a.receita || []) + (a.extra || 0);
const totalVenda = v => Math.max(0, v.itens.reduce((s, i) => s + i.preco * i.q, 0) - (v.desconto || 0));
const custoVenda = v => v.itens.reduce((s, i) => s + (i.custo || 0) * i.q, 0);
const nomeCliVenda = v => { const c = v.clienteId && by(db.clientes, v.clienteId); return c ? c.nome : (v.nome || 'Consumidor'); };
st.vt = 'vendas'; st.vmes = new Date();

function viewVendas() {
  const abas = [['vendas', '🛍️ Vendas'], ['artes', '🎨 Artes / produtos']];
  let corpo = '';
  if (st.vt === 'vendas') {
    const y = st.vmes.getFullYear(), m = st.vmes.getMonth();
    const vs = db.vendas.filter(v => { const d = new Date(v.data + 'T12:00'); return d.getFullYear() === y && d.getMonth() === m; }).sort((a, b) => b.data.localeCompare(a.data));
    const vendido = vs.reduce((s, v) => s + totalVenda(v), 0), custo = vs.reduce((s, v) => s + custoVenda(v), 0), areceber = db.vendas.filter(v => !v.pago).reduce((s, v) => s + totalVenda(v), 0);
    corpo = `<div class="mes"><button id="vp">‹</button><b>${MESES[m]} ${y}</b><button id="vn">›</button></div>
    <div class="grid3" style="margin-bottom:12px"><div class="kpi"><small>Vendido</small><b>${brl(vendido)}</b></div><div class="kpi"><small>Lucro</small><b class="${vendido - custo >= 0 ? 'pos' : 'neg'}">${brl(vendido - custo)}</b></div><div class="kpi"><small>A receber</small><b class="${areceber ? 'neg' : ''}">${brl(areceber)}</b></div></div>
    <div class="card">${vs.map(v => `<div class="row" data-v="${v.id}"><div><div class="t">${esc(nomeCliVenda(v))}</div><div class="s">${fdata(v.data)} · ${esc(v.itens.map(i => { const a = by(db.artes, i.arteId); return i.q + '× ' + (a ? a.nome : '?'); }).join(', '))}</div></div><div style="text-align:right"><b>${brl(totalVenda(v))}</b><div><span class="badge ${v.pago ? 'ok' : 'bad'}">${v.pago ? 'recebido' : 'a receber'}</span></div></div></div>`).join('') || '<div class="vazio">Nenhuma venda neste mês</div>'}</div>
    <button class="btn full" id="bvenda">＋ Nova venda</button>`;
  } else {
    const hist = [...db.pmovs].sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id)).slice(0, 15);
    corpo = `<div class="card">${db.artes.map(a => { const s = saldoArte(a), c = custoArte(a); return `<div class="row" data-a="${a.id}">${a.imgs && a.imgs[0] ? `<img src="${a.imgs[0]}" class="thumb">` : '<div class="thumb ph">🎨</div>'}<div style="flex:1"><div class="t">${esc(a.nome)}</div><div class="s">Estoque: ${s} un${c ? ' · custo ' + brl(c) : ''}</div></div><b>${brl(a.preco)}</b></div>`; }).join('') || '<div class="vazio">Cadastre suas artes (ex.: peças em gesso) para vender</div>'}</div>
    <button class="btn full" id="barte">＋ Nova arte / produto</button>${db.artes.length ? '<button class="btn sec full" id="bprod">🔨 Registrar produção</button>' : ''}
    ${hist.length ? `<div class="card" style="margin-top:12px"><h3>Últimas movimentações</h3>${hist.map(m => { const a = by(db.artes, m.arteId); return `<div class="row" data-pm="${m.id}"><div><div class="t">${esc(a ? a.nome : '(excluída)')}</div><div class="s">${fdata(m.data)} · ${m.tipo === 'producao' ? 'Produção' : m.tipo === 'venda' ? 'Venda' : 'Ajuste'}</div></div><b class="${m.qtd < 0 ? 'neg' : 'pos'}">${m.qtd > 0 ? '+' : ''}${m.qtd}</b></div>`; }).join('')}</div>` : ''}`;
  }
  app.innerHTML = `<div class="tabs">${abas.map(([k, t]) => `<button data-vt="${k}" class="${st.vt === k ? 'on' : ''}">${t}</button>`).join('')}</div>${corpo}`;
  app.querySelectorAll('[data-vt]').forEach(b => b.onclick = () => { st.vt = b.dataset.vt; viewVendas(); });
  app.querySelectorAll('[data-v]').forEach(r => r.onclick = () => formVenda(by(db.vendas, r.dataset.v)));
  app.querySelectorAll('[data-a]').forEach(r => r.onclick = () => formArte(by(db.artes, r.dataset.a)));
  app.querySelectorAll('[data-pm]').forEach(r => r.onclick = () => detalhePmov(by(db.pmovs, r.dataset.pm)));
  const y = st.vmes.getFullYear(), m = st.vmes.getMonth();
  const vp = $('#vp'); if (vp) { vp.onclick = () => { st.vmes = new Date(y, m - 1, 1); viewVendas(); }; $('#vn').onclick = () => { st.vmes = new Date(y, m + 1, 1); viewVendas(); }; }
  const bv = $('#bvenda'); if (bv) bv.onclick = () => formVenda();
  const ba = $('#barte'); if (ba) ba.onclick = () => formArte();
  const bp = $('#bprod'); if (bp) bp.onclick = () => formProduzir();
}

function formArte(a) {
  const novo = !a; a = a || { id: uid(), nome: '', desc: '', imgs: [], preco: 0, extra: 0, receita: [] };
  let imgs = [...(a.imgs || [])]; const comp = (a.receita || []).map(c => ({ ...c }));
  sheet(novo ? 'Nova arte / produto' : 'Arte / produto', `
    <label>Nome</label><input id="an" value="${esc(a.nome)}" placeholder="Ex.: Anjinho de gesso, Vaso pequeno">
    <label>Descrição (opcional)</label><textarea id="ad" rows="2">${esc(a.desc)}</textarea>
    <label>Fotos (até 3)</label><div id="aimg" class="fotos"></div><input type="file" id="af" accept="image/*" multiple hidden><button class="btn sec sm" id="afb" type="button">📷 Adicionar fotos</button>
    <label>Preço de venda (R$)</label><input id="ap" inputmode="decimal" value="${a.preco || ''}">
    <label>Insumos usados em 1 unidade (receita) — opcional</label>
    ${db.produtos.length ? '<div id="acomp"></div><button class="btn sec sm" id="aadd" type="button" style="margin-top:8px">＋ Adicionar insumo</button>' : '<div class="s" style="color:var(--mut)">Cadastre produtos em Estoque (ex.: gesso) para montar a receita.</div>'}
    <label>Outros custos por unidade (R$, opcional: molde, tinta, mão de obra...)</label><input id="ax" inputmode="decimal" value="${a.extra || ''}">
    <div class="s" id="acusto" style="margin-top:8px;color:var(--mut)"></div>
    <button class="btn full" id="asave">Salvar</button>
    ${novo ? '' : '<button class="btn sec full" id="aprod">🔨 Registrar produção</button><button class="btn sec full" id="aaj">✎ Ajustar estoque (contagem)</button><button class="btn del full" id="adel">Excluir</button>'}`, b => {
    const pv = () => { $('#aimg').innerHTML = imgs.map((s, k) => `<span class="ph1"><img src="${s}"><button type="button" data-rm="${k}">✕</button></span>`).join(''); };
    pv(); $('#aimg').onclick = e => { const r = e.target.closest('[data-rm]'); if (r) { imgs.splice(+r.dataset.rm, 1); pv(); } };
    $('#afb').onclick = () => $('#af').click();
    $('#af').onchange = async e => { for (const f of e.target.files) { if (imgs.length >= 3) break; await new Promise(r => lerImagem(f, d => { imgs.push(d); r(); })); } e.target.value = ''; pv(); };
    const ed = db.produtos.length ? editorComp($('#acomp'), comp) : null;
    const custo = () => { if (ed) ed.le(); const c = custoComp(comp) + num($('#ax').value); $('#acusto').textContent = c ? `Custo estimado por unidade: ${brl(c)}${num($('#ap').value) ? ' · lucro ≈ ' + brl(num($('#ap').value) - c) : ''}` : ''; };
    b.addEventListener('input', custo); b.addEventListener('change', custo); b.addEventListener('click', () => setTimeout(custo)); custo();
    if (ed) $('#aadd').onclick = () => { ed.adicionar(); custo(); };
    $('#asave').onclick = () => {
      const n = $('#an').value.trim(); if (!n) return toast('Informe o nome');
      if (ed) ed.le(); const bak = JSON.stringify(a);
      Object.assign(a, { nome: n, desc: $('#ad').value.trim(), imgs: [...imgs], preco: num($('#ap').value), extra: num($('#ax').value), receita: comp.filter(c => c.qtd > 0).map(c => ({ produtoId: c.produtoId, qtd: c.qtd })) });
      if (novo) db.artes.push(a);
      try { save(); } catch { if (novo) db.artes.pop(); else Object.assign(a, JSON.parse(bak)); return toast('Sem espaço: use menos fotos ou faça backup'); }
      fechar(); st.vt = 'artes'; render(); toast('Salvo');
    };
    if (!novo) {
      $('#aprod').onclick = () => formProduzir(a.id); $('#aaj').onclick = () => formAjusteArte(a);
      $('#adel').onclick = () => { if (db.pmovs.some(m => m.arteId === a.id)) return toast('Tem histórico de produção/venda; não dá para excluir'); if (!confirm('Excluir?')) return; db.artes = db.artes.filter(x => x.id !== a.id); save(); fechar(); render(); };
    }
  });
}

function formProduzir(arteId) {
  if (!db.artes.length) { toast('Cadastre uma arte primeiro'); return formArte(); }
  const a0 = by(db.artes, arteId) || db.artes[0];
  sheet('Registrar produção', `
    <label>O que foi produzido</label><select id="pa">${db.artes.map(a => `<option value="${a.id}" ${a.id === a0.id ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select>
    <label>Quantas unidades</label><input id="pq" type="number" min="1" inputmode="numeric" value="1">
    <label>Data</label><input type="date" id="pd" value="${hoje()}">
    <div id="pres" style="margin-top:10px"></div>
    <button class="btn full" id="psave">Registrar produção</button>`, b => {
    const arte = () => by(db.artes, $('#pa').value), q = () => Math.max(1, parseInt($('#pq').value) || 1);
    const atual = () => {
      const a = arte(), n = q(), rec = a.receita || [];
      $('#pres').innerHTML = (rec.length ? '<div class="s" style="color:var(--mut)">Insumos que serão baixados do estoque:</div>' + rec.map(c => { const p = by(db.produtos, c.produtoId); return p ? `<div class="row"><span>${esc(p.nome)}</span><span>−${fmtQtd(c.qtd * n, p.un)} <small style="color:var(--mut)">(tem ${fmtQtd(saldoProd(p), p.un)})</small></span></div>` : ''; }).join('') : '<div class="s" style="color:var(--mut)">Esta arte não tem receita: só entra no estoque de artes.</div>') + `<div class="s" style="margin-top:6px">Custo dos insumos: <b>${brl(custoComp(rec) * n)}</b></div>`;
    };
    b.addEventListener('input', atual); b.addEventListener('change', atual); atual();
    $('#psave').onclick = () => {
      const a = arte(), n = q(), rec = a.receita || [], f = faltasComp(rec, n), data = $('#pd').value || hoje();
      if (f.length && !confirm('Insumos insuficientes:\n\n' + f.join('\n') + '\n\nRegistrar mesmo assim (ficará negativo)?')) return;
      const lote = rec.length ? baixarComp(rec, n, { motivo: `Produção: ${n}× ${a.nome}`, arteId: a.id, data }) : uid();
      db.pmovs.push({ id: uid(), arteId: a.id, data, tipo: 'producao', qtd: n, lote });
      save(); fechar(); st.vt = 'artes'; if (rota === 'vendas') render(); toast('Produção registrada');
    };
  });
}
function formAjusteArte(a) {
  sheet('Ajustar estoque', `<div class="s" style="color:var(--mut)">${esc(a.nome)} · estoque no sistema: <b>${saldoArte(a)} un</b></div>
    <label>Quantidade real que tenho agora</label><input id="jq" type="number" min="0" inputmode="numeric" value="${saldoArte(a)}">
    <button class="btn full" id="jsave">Ajustar</button>`, () => {
    $('#jsave').onclick = () => { const novo = Math.max(0, parseInt($('#jq').value) || 0), d = novo - saldoArte(a); if (!d) return fechar(); db.pmovs.push({ id: uid(), arteId: a.id, data: hoje(), tipo: 'ajuste', qtd: d }); save(); fechar(); render(); toast('Estoque ajustado'); };
  });
}
function detalhePmov(m) {
  const a = by(db.artes, m.arteId);
  if (m.tipo === 'venda') return formVenda(by(db.vendas, m.vendaId));
  sheet('Movimentação', `<div class="row"><span>Arte</span><b>${esc(a ? a.nome : '')}</b></div><div class="row"><span>Tipo</span><b>${m.tipo === 'producao' ? 'Produção' : 'Ajuste'}</b></div><div class="row"><span>Quantidade</span><b>${m.qtd > 0 ? '+' : ''}${m.qtd}</b></div><div class="row"><span>Data</span><b>${fdata(m.data)}</b></div>
    <button class="btn del full" id="pmdel">Desfazer${m.tipo === 'producao' ? ' (devolve os insumos ao estoque)' : ''}</button>`, () => {
    $('#pmdel').onclick = () => { if (!confirm('Desfazer esta movimentação?')) return; if (m.lote) db.movs = db.movs.filter(x => x.lote !== m.lote); db.pmovs = db.pmovs.filter(x => x.id !== m.id); save(); fechar(); render(); };
  });
}

function formVenda(v) {
  if (!v && !db.artes.length) { toast('Cadastre as artes primeiro'); st.vt = 'artes'; return formArte(); }
  const novo = !v;
  v = v || { id: uid(), data: hoje(), clienteId: '', nome: '', itens: [], desconto: 0, forma: 'pix', parcelas: 1, primeira: hoje(), pago: true, obs: '' };
  const antes = id => (v.itens.find(i => i.arteId === id) || { q: 0 }).q;
  sheet(novo ? 'Nova venda' : 'Venda', `
    <label>Data</label><input type="date" id="vd" value="${v.data}">
    <label>Cliente</label><select id="vc"><option value="">Consumidor (sem cadastro)</option>${db.clientes.map(c => `<option value="${c.id}" ${c.id === v.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
    <input id="vn" placeholder="Nome (opcional)" value="${esc(v.nome)}" style="margin-top:6px">
    <label>Itens vendidos</label>
    ${db.artes.map(a => { const it = v.itens.find(i => i.arteId === a.id); return `<div class="vrow" data-a="${a.id}"><div class="itemsel"><span>${esc(a.nome)}<br><small style="color:var(--mut)">estoque ${saldoArte(a)} · custo ${brl(custoArte(a))}</small></span><input type="number" min="0" inputmode="numeric" data-vq value="${it ? it.q : 0}" title="Quantidade"></div><div class="par"><input inputmode="decimal" data-vp value="${it ? it.preco : a.preco || ''}" placeholder="Preço unit."></div></div>`; }).join('')}
    <label>Desconto (R$)</label><input id="vdesc" inputmode="decimal" value="${v.desconto || ''}">
    <div class="total" id="vtot"></div>
    <h3 style="margin:16px 0 0">Pagamento</h3>
    <label>Forma de pagamento</label><select id="vf">${['pix', 'dinheiro', 'debito', 'credito', 'boleto', 'outro'].map(k => `<option value="${k}" ${v.forma === k ? 'selected' : ''}>${FORMAS_ALL[k]}</option>`).join('')}</select>
    <label>Parcelas (1 = à vista)</label><input id="vpa" type="number" min="1" max="36" inputmode="numeric" value="${v.parcelas || 1}">
    <label>Data da 1ª parcela</label><input type="date" id="vp1" value="${v.primeira || v.data}">
    <div class="chk"><input type="checkbox" id="vpg" ${v.pago ? 'checked' : ''}><label style="margin:0">Já recebi (lança a entrada no Caixa)</label></div>
    <label>Observações</label><textarea id="vo" rows="2">${esc(v.obs)}</textarea>
    <button class="btn full" id="vsave">Salvar venda</button>${novo ? '' : '<button class="btn del full" id="vdel">Excluir venda</button>'}`, b => {
    const ler = () => ({ ...v, data: $('#vd').value, clienteId: $('#vc').value, nome: $('#vn').value.trim(), desconto: num($('#vdesc').value), forma: $('#vf').value, parcelas: Math.max(1, Math.min(36, parseInt($('#vpa').value) || 1)), primeira: $('#vp1').value || $('#vd').value, pago: $('#vpg').checked, obs: $('#vo').value.trim(),
      itens: [...b.querySelectorAll('.vrow')].map(r => { const a = by(db.artes, r.dataset.a), q = Math.max(0, parseInt(r.querySelector('[data-vq]').value) || 0), ant = v.itens.find(i => i.arteId === a.id); return { arteId: a.id, q, preco: num(r.querySelector('[data-vp]').value), custo: ant && ant.custo != null ? ant.custo : custoArte(a) }; }).filter(i => i.q > 0) });
    const atual = () => { const o = ler(), t = totalVenda(o), c = custoVenda(o); $('#vtot').innerHTML = 'Total: ' + brl(t) + (c ? `<div class="s" style="font-weight:400">Custo ${brl(c)} · Lucro <b class="${t - c >= 0 ? 'pos' : 'neg'}">${brl(t - c)}</b></div>` : ''); };
    b.addEventListener('input', atual); b.addEventListener('change', atual); atual();
    $('#vsave').onclick = () => {
      const o = ler(); if (!o.data) return toast('Informe a data'); if (!o.itens.length) return toast('Marque a quantidade vendida de ao menos um item');
      const falta = o.itens.filter(i => { const a = by(db.artes, i.arteId); return saldoArte(a) + antes(i.arteId) < i.q; }).map(i => { const a = by(db.artes, i.arteId); return `${a.nome}: vendendo ${i.q}, estoque ${saldoArte(a) + antes(i.arteId)}`; });
      if (falta.length && !confirm('Estoque insuficiente:\n\n' + falta.join('\n') + '\n\nSalvar mesmo assim (o estoque ficará negativo)?')) return;
      db.pmovs = db.pmovs.filter(m => m.vendaId !== o.id); db.lancamentos = db.lancamentos.filter(l => l.vendaId !== o.id);
      const existe = by(db.vendas, o.id); if (existe) Object.assign(existe, o); else db.vendas.push(o);
      o.itens.forEach(i => db.pmovs.push({ id: uid(), arteId: i.arteId, data: o.data, tipo: 'venda', qtd: -i.q, vendaId: o.id }));
      if (o.pago) {
        const total = totalVenda(o), pa = o.parcelas, cada = Math.floor(total / pa * 100) / 100;
        for (let k = 0; k < pa; k++) db.lancamentos.push({ id: uid(), tipo: 'r', valor: k === pa - 1 ? +(total - cada * (pa - 1)).toFixed(2) : cada, data: somaMeses(o.primeira, k), cat: 'Venda de produtos', desc: `Venda: ${nomeCliVenda(o)}${pa > 1 ? ` (${k + 1}/${pa})` : ''}`, forma: o.forma, vendaId: o.id, origem: 'venda' });
      }
      save(); fechar(); st.vt = 'vendas'; st.vmes = new Date(o.data + 'T12:00'); if (rota === 'vendas') render(); toast('Venda salva');
    };
    if (!novo) $('#vdel').onclick = () => { if (!confirm('Excluir esta venda? O estoque das artes e os lançamentos no Caixa também são revertidos.')) return; db.vendas = db.vendas.filter(x => x.id !== v.id); db.pmovs = db.pmovs.filter(m => m.vendaId !== v.id); db.lancamentos = db.lancamentos.filter(l => l.vendaId !== v.id); save(); fechar(); render(); };
  });
}
