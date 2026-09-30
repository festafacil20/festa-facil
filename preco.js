'use strict';
/* ===== Calculadora de preço de venda =====
   preço = custo total ÷ (1 − taxas% − impostos% − outras% − margem%)
   A margem é o lucro sobre o preço de venda, já descontadas as taxas. Taxas e margens padrão ficam em db.config.preco. */
const PRECO_PADRAO = () => ({ taxa: 0, imposto: 0, outras: 0, fixo: 0, margens: [{ nome: 'Atacado', m: 25 }, { nome: 'Varejo', m: 50 }, { nome: 'Promoção', m: 15 }] });
const cfgPreco = () => ({ ...PRECO_PADRAO(), ...(db.config.preco || {}) });
const arred90 = v => Math.ceil(v - 0.9) + 0.9; // sobe para o próximo ,90 (12,34 → 12,90)
const pct = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR') + '%';
function produtosComCusto() {
  const artes = db.artes.map(a => ({ id: 'a:' + a.id, nome: a.nome + (kitDe(a) ? ' (kit)' : ''), custo: custoArte(a), preco: a.preco || 0 }));
  const kits = db.kits.filter(k => !db.artes.some(a => a.kitId === k.id)).map(k => ({ id: 'k:' + k.id, nome: k.nome + ' (kit)', custo: custoComp(k.itens), preco: 0 }));
  return [...artes, ...kits].filter(x => x.custo > 0).sort((a, b) => a.nome.localeCompare(b.nome));
}
// host: onde desenhar. opts: { custo, preco, nome, onUsar(preco), aberta, noInicio }
function calcPreco(host, opts = {}) {
  if (!host) return;
  const c = cfgPreco(), margens = c.margens.map(x => ({ ...x })), prods = produtosComCusto();
  let sel = 1, persM = 30; // Varejo selecionada; margem personalizada inicial
  const n2 = v => v ? String(+(+v).toFixed(2)).replace('.', ',') : '';
  host.innerHTML = `<details class="card calc" ${opts.aberta ? 'open' : ''}><summary><b>🏷️ Calculadora de preço de venda</b><small>${opts.nome ? esc(opts.nome) : 'Quanto cobrar para ter lucro no atacado e no varejo.'}</small></summary>
    ${opts.noInicio ? `<label>Produto ou kit (opcional)</label><select data-pp><option value="">Digitar o custo</option>${prods.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>` : ''}
    <h4 class="calch">Custos por unidade</h4>
    <label style="margin-top:0">Custo do produto pronto (R$)</label><input data-pc inputmode="decimal" placeholder="Materiais" value="${n2(opts.custo)}">
    <div class="par"><div><label>Embalagem (R$)</label><input data-pe inputmode="decimal" placeholder="0"></div><div><label>Mão de obra (R$)</label><input data-pm inputmode="decimal" placeholder="0"></div></div>
    <label>Outros custos (R$)</label><input data-po inputmode="decimal" placeholder="Etiqueta, brinde, entrega grátis...">
    <h4 class="calch">Taxas e impostos <small>(sobre o preço de venda)</small></h4>
    <div class="par"><div><label style="margin-top:0">Taxa de pagamento (%)</label><input data-tx inputmode="decimal" placeholder="Pix = 0" value="${n2(c.taxa)}"></div><div><label style="margin-top:0">Impostos (%)</label><input data-ti inputmode="decimal" placeholder="0" value="${n2(c.imposto)}"></div></div>
    <div class="par"><div><label>Outras taxas (%)</label><input data-to inputmode="decimal" placeholder="Comissão" value="${n2(c.outras)}"></div><div><label>Taxa fixa por venda (R$)</label><input data-tf inputmode="decimal" placeholder="0" value="${n2(c.fixo)}"></div></div>
    <h4 class="calch">Margem de lucro</h4>
    <div class="margens">${margens.map((x, i) => `<div class="mg"><button type="button" data-ms="${i}">${esc(x.nome)}</button><div class="par"><input data-mv="${i}" inputmode="decimal" value="${n2(x.m)}"><span>%</span></div></div>`).join('')}
      <div class="mg"><button type="button" data-ms="p">Personalizada</button><div class="par"><input data-mv="p" inputmode="decimal" value="${persM}"><span>%</span></div></div></div>
    <div data-res></div>
    <button class="btn sec sm" type="button" data-salvar style="margin-top:8px">💾 Salvar taxas e margens como padrão</button></details>`;
  const q = s => host.querySelector(s), qa = s => host.querySelectorAll(s);
  const margem = i => num(q(`[data-mv="${i}"]`).value);
  const calc = () => {
    const custo = num(q('[data-pc]').value) + num(q('[data-pe]').value) + num(q('[data-pm]').value) + num(q('[data-po]').value) + num(q('[data-tf]').value);
    const taxas = (num(q('[data-tx]').value) + num(q('[data-ti]').value) + num(q('[data-to]').value)) / 100;
    qa('[data-ms]').forEach(b => b.classList.toggle('on', b.dataset.ms === String(sel)));
    if (!custo) { q('[data-res]').innerHTML = '<div class="s" style="color:var(--mut);margin-top:8px">Informe o custo do produto para ver o preço.</div>'; return; }
    const linha = (nome, m, destaque, i) => {
      const den = 1 - taxas - m / 100;
      if (den <= 0) return `<tr class="${destaque ? 'on' : ''}"><td>${esc(nome)}</td><td colspan="3" class="neg">Taxas + margem passam de 100%</td></tr>`;
      const preco = custo / den, r = arred90(preco), lucroR = r * (1 - taxas) - custo;
      return `<tr class="${destaque ? 'on' : ''}"><td>${esc(nome)}<br><small>${pct(m)}</small></td><td>${brl(preco)}<br><b>${brl(r)}</b></td><td class="pos">${brl(lucroR)}</td>${opts.onUsar ? `<td><button type="button" class="btn sm" data-usar="${r}">Usar</button></td>` : ''}</tr>`;
    };
    const ms = [...margens.map((x, i) => [x.nome, margem(i), i]), ['Personalizada', margem('p'), 'p']];
    const escolhida = ms.find(x => String(x[2]) === String(sel)), den = 1 - taxas - escolhida[1] / 100;
    const precoSel = den > 0 ? arred90(custo / den) : 0;
    let atual = '';
    const pa = opts.preco || 0;
    if (pa > 0) { const lucro = pa * (1 - taxas) - custo, mReal = lucro / pa * 100; atual = `<div class="aviso ${lucro < 0 ? 'bad' : ''}" style="${lucro >= 0 ? 'background:#e7f7ec;border-color:var(--ok)' : ''}">Hoje você vende por <b>${brl(pa)}</b>: lucro de <b>${brl(lucro)}</b> por unidade (margem de ${pct(mReal)}).</div>`; }
    q('[data-res]').innerHTML = `<div class="calcres"><small>Preço sugerido · ${esc(escolhida[0])} (${pct(escolhida[1])})</small><b>${precoSel ? brl(precoSel) : '—'}</b><small>custo total ${brl(custo)} · lucro ${precoSel ? brl(precoSel * (1 - taxas) - custo) : '—'} por unidade</small></div>
      <table class="tprec"><tr><th>Margem</th><th>Preço<br><small>exato / arredondado</small></th><th>Lucro/un</th>${opts.onUsar ? '<th></th>' : ''}</tr>${ms.map(x => linha(x[0], x[1], String(x[2]) === String(sel), x[2])).join('')}</table>${atual}`;
    qa('[data-usar]').forEach(b => b.onclick = () => opts.onUsar(+b.dataset.usar));
  };
  host.addEventListener('input', calc); host.addEventListener('change', calc);
  qa('[data-ms]').forEach(b => b.onclick = () => { sel = b.dataset.ms === 'p' ? 'p' : +b.dataset.ms; calc(); });
  const pp = q('[data-pp]'); if (pp) pp.onchange = () => { const p = prods.find(x => x.id === pp.value); q('[data-pc]').value = p ? n2(p.custo) : ''; opts.preco = p ? p.preco : 0; calc(); };
  q('[data-salvar]').onclick = () => {
    db.config.preco = { taxa: num(q('[data-tx]').value), imposto: num(q('[data-ti]').value), outras: num(q('[data-to]').value), fixo: num(q('[data-tf]').value), margens: margens.map((x, i) => ({ nome: x.nome, m: margem(i) })) };
    save(); toast('Taxas e margens salvas como padrão');
  };
  calc();
}
